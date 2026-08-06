//+------------------------------------------------------------------+
//|                                            TradeAnalyzerORB.mq5   |
//|   Opening Range Breakout (ORB) day-trading EA for XAUUSD (gold).  |
//|                                                                  |
//|   Idea: gold makes its impulsive moves when session volume        |
//|   arrives. Mark the high/low of the first N minutes of the        |
//|   session (the "opening range"), then trade the first clean       |
//|   breakout of that range, with the stop parked on the opposite    |
//|   side of the range. Structural, not another lagging indicator.   |
//|                                                                  |
//|   Risk shell is the one proven in TradeAnalyzerEA: %-of-balance   |
//|   sizing via OrderCalcProfit, exposure cap, daily loss cap,       |
//|   break-even, ATR trailing, and an entry-funnel diagnostic.       |
//|                                                                  |
//|   NOT financial advice. Backtest, then DEMO, before anything else.|
//+------------------------------------------------------------------+
#property copyright "TradeAnalyzer"
#property version   "1.00"
#property strict

#include <Trade/Trade.mqh>
#include <Trade/PositionInfo.mqh>

//====================================================================
//  INPUTS
//====================================================================

//--- General
input group "=== General ==="
input long   InpMagic          = 20260806;    // Magic number (isolates this EA's trades)
input bool   InpDryRun         = false;       // DryRun: log signals, place NO orders
input string InpTradeComment   = "ORB";

//--- Opening range definition
input group "=== Opening range ==="
input int    InpRangeStartHour = 7;           // Range start hour (server time, 0-23)
input int    InpRangeStartMin  = 0;           // Range start minute
input int    InpRangeMinutes   = 60;          // Range length in minutes
input int    InpTradeUntilHour = 17;          // Stop opening new trades after this hour
input double InpBreakoutBuffer = 20;          // Breakout must clear the range by this many points

//--- Range quality filters, measured against the DAILY ATR so the thresholds
//--- mean the same thing on any chart timeframe.
input group "=== Range quality ==="
input double InpMinRangeDailyAtr = 0.08;      // Skip day if range < this * daily ATR (too quiet)
input double InpMaxRangeDailyAtr = 0.50;      // Skip day if range > this * daily ATR (stop too wide)
input int    InpAtrPeriod        = 14;        // ATR period (chart TF, fallback only)
input int    InpDailyAtrPeriod   = 14;        // ATR period on D1 (used for range quality)

//--- Risk & money management (same engine as TradeAnalyzerEA)
input group "=== Risk management ==="
input double InpRiskPercent    = 0.5;         // Risk per trade, % of balance
input double InpRewardRisk     = 2.0;         // Take-profit = risk * this (RR)
input double InpMaxLot         = 5.0;         // Hard cap on lot size (broker units)
input double InpMaxLotPer10k   = 0.10;        // Exposure cap: max lot per $10k equity (0 = off)
input double InpDailyLossCapPct= 3.0;         // Stop trading for the day after this % equity loss
input int    InpMaxTradesPerDay= 2;           // Max NEW trades opened per day
input int    InpMaxOpenPos     = 1;           // Max simultaneous positions from this EA
input bool   InpOnePerDirection= true;        // At most one breakout trade per direction per day

//--- Trade management
input group "=== Trade management ==="
input bool   InpUseBreakEven   = true;        // Move SL to entry after some profit
input double InpBreakEvenAtR   = 1.0;         // Trigger break-even at this R (multiple of risk)
input bool   InpUseTrailing    = true;        // Trailing stop (in units of initial risk R)
input double InpTrailRMult     = 1.5;         // Trailing distance = this * initial risk R

//--- Filters
input group "=== Filters (gold) ==="
input double InpMaxSpreadPoints   = 60.0;     // Skip entries when spread (points) exceeds this
input bool   InpCloseAtSessionEnd = true;     // Flatten all EA positions at session end
input int    InpSessionEndHour    = 20;       // Session end hour (server time)
input bool   InpNoFriday          = false;    // Do not open new trades on Friday

//====================================================================
//  GLOBALS
//====================================================================
CTrade         trade;
CPositionInfo  posInfo;

int hAtr, hDailyAtr;

datetime lastBarTime   = 0;
datetime dayStamp      = 0;      // start-of-day marker for daily counters
double   dayStartEquity= 0.0;
int      tradesToday   = 0;
bool     tradingHaltedToday = false;

// --- Opening range state, rebuilt every day ---
double   rangeHigh     = 0.0;
double   rangeLow      = 0.0;
bool     rangeReady    = false;  // range window has closed and was measured
bool     rangeRejected = false;  // range failed the quality filter today
bool     tookLong      = false;
bool     tookShort     = false;
bool     seenLongBreak = false;  // diagnostics: first up-breakout seen today
bool     seenShortBreak= false;  // diagnostics: first down-breakout seen today

// --- Diagnostics ---
long statBars=0, statDayRolls=0, statRangesBuilt=0, statRangeRejected=0;
long statBreakouts=0, statOpened=0;
long statBlkDryRun=0, statBlkDailyCap=0, statBlkMaxTrades=0, statBlkMaxPos=0;
long statBlkSpread=0, statBlkTooLate=0, statBlkFriday=0, statBlkDirDone=0;

//====================================================================
//  INIT / DEINIT
//====================================================================
int OnInit()
{
   trade.SetExpertMagicNumber(InpMagic);
   trade.SetDeviationInPoints(20);
   trade.SetTypeFillingBySymbol(_Symbol);

   hAtr      = iATR(_Symbol, _Period,   InpAtrPeriod);
   hDailyAtr = iATR(_Symbol, PERIOD_D1, InpDailyAtrPeriod);
   if(hAtr == INVALID_HANDLE || hDailyAtr == INVALID_HANDLE)
   {
      Print("ERROR: failed to create ATR handle(s).");
      return(INIT_FAILED);
   }

   if(InpRangeMinutes < PeriodSeconds(_Period)/60)
      Print("WARN: range length is shorter than one bar — use a lower chart timeframe.");

   ResetDailyState();

   PrintFormat("TradeAnalyzerORB started on %s %s | range %02d:%02d +%dmin | DryRun=%s | Risk=%.2f%% | RR=%.1f",
               _Symbol, EnumToString((ENUM_TIMEFRAMES)_Period),
               InpRangeStartHour, InpRangeStartMin, InpRangeMinutes,
               (InpDryRun?"YES":"NO"), InpRiskPercent, InpRewardRisk);

   if(!InpDryRun && !MQLInfoInteger(MQL_TESTER) &&
      AccountInfoInteger(ACCOUNT_TRADE_MODE) == ACCOUNT_TRADE_MODE_REAL)
      Print("WARNING: live trading is ENABLED on a REAL account.");

   return(INIT_SUCCEEDED);
}

void OnDeinit(const int reason)
{
   IndicatorRelease(hAtr);
   IndicatorRelease(hDailyAtr);
   PrintEntryFunnel();
}

double OnTester()
{
   PrintEntryFunnel();
   return 0.0;
}

//====================================================================
//  MAIN LOOP
//====================================================================
void OnTick()
{
   RollDailyStateIfNeeded();
   ManageOpenPositions();

   // The opening range can be measured as soon as its window has closed.
   TryBuildRange();

   if(!IsNewBar())
      return;

   statBars++;

   if(!rangeReady || rangeRejected)
      return;

   // ---- Breakout detection on the just-closed bar ----
   int action = BreakoutDirection();
   if(action == 0)
      return;

   // Count a breakout once per direction per day. Price stays outside the range
   // for many bars after it breaks, so counting every such bar would report
   // tens of thousands of "breakouts" for a few hundred real setups.
   if(action > 0 && !seenLongBreak)  { seenLongBreak  = true; statBreakouts++; }
   if(action < 0 && !seenShortBreak) { seenShortBreak = true; statBreakouts++; }

   string block = "";
   if(!CanOpenNewTrade(action, block))
   {
      if(block != "")
         PrintFormat("Entry blocked: %s", block);
      return;
   }

   if(OpenTrade(action))
   {
      statOpened++;
      if(action > 0) tookLong = true; else tookShort = true;
   }
}

//====================================================================
//  OPENING RANGE
//====================================================================
// Measure today's opening range once its window has closed.
void TryBuildRange()
{
   if(rangeReady || rangeRejected)
      return;

   datetime rStart = RangeStartTime();
   datetime rEnd   = (datetime)((long)rStart + (long)InpRangeMinutes * 60);
   if(TimeCurrent() < rEnd)
      return;                       // window still forming

   MqlRates rates[];
   int n = CopyRates(_Symbol, _Period, rStart, (datetime)((long)rEnd - 1), rates);
   if(n <= 0)
      return;                       // no data yet; try again on the next tick

   double hi = rates[0].high, lo = rates[0].low;
   for(int i = 1; i < n; i++)
   {
      if(rates[i].high > hi) hi = rates[i].high;
      if(rates[i].low  < lo) lo = rates[i].low;
   }

   // Quality filter against the DAILY ATR: "the opening range should be a
   // sensible fraction of a normal day's move". Measuring against the chart
   // timeframe's ATR instead would make the thresholds mean something
   // different on every timeframe (a 60-minute range dwarfs an M5 ATR).
   double dAtr = GetDailyAtr();
   double size = hi - lo;
   if(dAtr > 0)
   {
      double frac = size / dAtr;
      if(frac < InpMinRangeDailyAtr || frac > InpMaxRangeDailyAtr)
      {
         rangeRejected = true;
         statRangeRejected++;
         PrintFormat("Range rejected: size %.2f = %.0f%% of daily ATR %.2f (allowed %.0f%%..%.0f%%)",
                     size, frac*100.0, dAtr,
                     InpMinRangeDailyAtr*100.0, InpMaxRangeDailyAtr*100.0);
         return;
      }
   }

   rangeHigh  = hi;
   rangeLow   = lo;
   rangeReady = true;
   statRangesBuilt++;
   PrintFormat("Opening range set: high=%.2f low=%.2f size=%.2f (%d bars)", hi, lo, size, n);
}

// +1 if the last closed bar broke above the range, -1 below, 0 otherwise.
int BreakoutDirection()
{
   double buffer = InpBreakoutBuffer * SymbolInfoDouble(_Symbol, SYMBOL_POINT);
   double close  = iClose(_Symbol, _Period, 1);
   if(close <= 0) return 0;

   if(close > rangeHigh + buffer) return  1;
   if(close < rangeLow  - buffer) return -1;
   return 0;
}

datetime RangeStartTime()
{
   long midnight = (long)DateOfDay(TimeCurrent());
   return (datetime)(midnight + (long)InpRangeStartHour * 3600 + (long)InpRangeStartMin * 60);
}

//====================================================================
//  ENTRY GATING
//====================================================================
bool CanOpenNewTrade(int action, string &block)
{
   block = "";

   if(InpDryRun)                 { statBlkDryRun++;   block = "DryRun mode (no orders)"; return false; }
   if(tradingHaltedToday)        { statBlkDailyCap++; block = "daily loss cap hit";      return false; }

   if(InpOnePerDirection && ((action > 0 && tookLong) || (action < 0 && tookShort)))
   { statBlkDirDone++; block = "this direction already traded today"; return false; }

   if(tradesToday >= InpMaxTradesPerDay)   { statBlkMaxTrades++; block = "max trades/day reached";    return false; }
   if(CountEaPositions() >= InpMaxOpenPos) { statBlkMaxPos++;    block = "max open positions reached"; return false; }

   // Too late in the day to start a new intraday trade.
   if(HourNow() >= InpTradeUntilHour)
   { statBlkTooLate++; block = "past the last entry hour"; return false; }

   double spread = (double)SymbolInfoInteger(_Symbol, SYMBOL_SPREAD);
   if(spread > InpMaxSpreadPoints)
   { statBlkSpread++; block = StringFormat("spread %.0f > max %.0f", spread, InpMaxSpreadPoints); return false; }

   if(InpNoFriday && IsFriday())
   { statBlkFriday++; block = "no-Friday filter"; return false; }

   return true;
}

//====================================================================
//  ORDER PLACEMENT
//====================================================================
bool OpenTrade(int action)
{
   double buffer = InpBreakoutBuffer * SymbolInfoDouble(_Symbol, SYMBOL_POINT);
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);

   // The stop lives on the far side of the range: if price comes all the way
   // back through the range, the breakout has failed and there is no reason to
   // stay in. Risk is therefore the range size (plus buffer), not a guess.
   double entry, sl, tp;
   if(action > 0) { entry = ask; sl = rangeLow  - buffer; }
   else           { entry = bid; sl = rangeHigh + buffer; }

   double riskDist = MathAbs(entry - sl);
   if(riskDist <= 0) { Print("Cannot open: zero risk distance."); return false; }

   tp = (action > 0) ? entry + riskDist * InpRewardRisk
                     : entry - riskDist * InpRewardRisk;

   sl = NormalizeToTick(sl);
   tp = NormalizeToTick(tp);

   if(!RespectsStopLevel(action, entry, sl, tp))
   { Print("Cannot open: SL/TP inside broker's stop level."); return false; }

   double lot = CalcLotByRisk(action, entry, sl);
   if(lot <= 0) { Print("Cannot open: computed lot <= 0."); return false; }

   double plannedLoss = MoneyRisk(action, entry, sl, lot);

   bool ok;
   if(action > 0) ok = trade.Buy (lot, _Symbol, 0.0, sl, tp, InpTradeComment);
   else           ok = trade.Sell(lot, _Symbol, 0.0, sl, tp, InpTradeComment);

   if(ok)
   {
      tradesToday++;
      double equity = AccountInfoDouble(ACCOUNT_EQUITY);
      PrintFormat("OPEN %s lot=%.2f entry~%.2f SL=%.2f TP=%.2f | risk=$%.2f (%.2f%% of equity) | range %.2f-%.2f",
                  (action>0?"BUY":"SELL"), lot, entry, sl, tp,
                  plannedLoss, (equity>0 ? plannedLoss/equity*100.0 : 0.0), rangeLow, rangeHigh);
   }
   else
   {
      PrintFormat("Order FAILED: retcode=%d %s", trade.ResultRetcode(), trade.ResultRetcodeDescription());
   }
   return ok;
}

// Money a position of `lot` loses going from `entry` to `sl`, using the
// broker's own contract math. Authoritative across symbols and brokers.
double MoneyRisk(int action, double entry, double sl, double lot)
{
   ENUM_ORDER_TYPE ot = (action > 0) ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
   double profit = 0.0;
   if(!OrderCalcProfit(ot, _Symbol, lot, entry, sl, profit))
      return 0.0;
   return MathAbs(profit);
}

double CalcLotByRisk(int action, double entry, double sl)
{
   double balance   = AccountInfoDouble(ACCOUNT_BALANCE);
   double riskMoney = balance * InpRiskPercent / 100.0;

   double lossPerLot = MoneyRisk(action, entry, sl, 1.0);
   if(lossPerLot <= 0.0)
   {
      Print("Cannot size: OrderCalcProfit returned <= 0 for 1 lot.");
      return 0.0;
   }

   double lot = riskMoney / lossPerLot;

   // Exposure cap: keeps the worst case bounded even when the range (and thus
   // the stop) is unusually tight, which would otherwise inflate the lot.
   if(InpMaxLotPer10k > 0)
   {
      double equity = AccountInfoDouble(ACCOUNT_EQUITY);
      double lotCap = InpMaxLotPer10k * (equity / 10000.0);
      if(lot > lotCap)
      {
         PrintFormat("Lot %.2f capped to %.2f by exposure limit (%.2f lot/$10k).",
                     lot, lotCap, InpMaxLotPer10k);
         lot = lotCap;
      }
   }

   double minLot = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double maxLot = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   double step   = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);

   if(step > 0) lot = MathFloor(lot/step) * step;
   lot = MathMin(lot, MathMin(maxLot, InpMaxLot));
   if(lot < minLot)
   {
      double minLotRisk = MoneyRisk(action, entry, sl, minLot);
      PrintFormat("SKIP: balance too small for %.2f%% risk on %s. Min lot %.2f would risk $%.2f, target is $%.2f.",
                  InpRiskPercent, _Symbol, minLot, minLotRisk, riskMoney);
      return 0.0;
   }
   return lot;
}

//====================================================================
//  POSITION MANAGEMENT
//====================================================================
void ManageOpenPositions()
{
   bool flatten = (InpCloseAtSessionEnd && HourNow() >= InpSessionEndHour);
   double atr = GetAtr();

   for(int i = PositionsTotal()-1; i >= 0; i--)
   {
      if(!posInfo.SelectByIndex(i)) continue;
      if(posInfo.Symbol() != _Symbol) continue;
      if(posInfo.Magic()  != InpMagic) continue;

      if(flatten)
      {
         trade.PositionClose(posInfo.Ticket());
         PrintFormat("Session end: closed #%I64u", posInfo.Ticket());
         continue;
      }

      long   type  = posInfo.PositionType();
      double open  = posInfo.PriceOpen();
      double curSL = posInfo.StopLoss();
      double curTP = posInfo.TakeProfit();
      double bid   = SymbolInfoDouble(_Symbol, SYMBOL_BID);
      double ask   = SymbolInfoDouble(_Symbol, SYMBOL_ASK);

      double newSL = curSL;

      // Initial risk R, recovered from the take-profit rather than the stop:
      // TP was placed at entry +/- R * RewardRisk and never moves, whereas the
      // stop does. Deriving R from a moving stop would shrink the trailing
      // distance every time it tightened, strangling the trade.
      double riskDist = 0.0;
      if(curTP > 0 && InpRewardRisk > 0)
         riskDist = MathAbs(curTP - open) / InpRewardRisk;
      if(riskDist <= 0)
         riskDist = (curSL > 0) ? MathAbs(open - curSL) : atr;

      // --- Break-even ---
      if(InpUseBreakEven && riskDist > 0)
      {
         if(type == POSITION_TYPE_BUY)
         {
            if((bid - open) >= riskDist * InpBreakEvenAtR && curSL < open)
               newSL = MathMax(newSL, open);
         }
         else
         {
            if((open - ask) >= riskDist * InpBreakEvenAtR && (curSL > open || curSL == 0))
               newSL = (newSL == 0) ? open : MathMin(newSL, open);
         }
      }

      // --- Trailing, measured in R so it behaves identically on any timeframe ---
      if(InpUseTrailing && riskDist > 0)
      {
         double trail = riskDist * InpTrailRMult;
         if(type == POSITION_TYPE_BUY)
         {
            double cand = bid - trail;
            if(cand > newSL) newSL = cand;
         }
         else
         {
            double cand = ask + trail;
            if(newSL == 0 || cand < newSL) newSL = cand;
         }
      }

      newSL = NormalizeToTick(newSL);
      if(newSL > 0 && MathAbs(newSL - curSL) > SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE))
      {
         bool improves = (type == POSITION_TYPE_BUY) ? (newSL > curSL || curSL == 0)
                                                     : (newSL < curSL || curSL == 0);
         if(improves && StopLevelOkForModify(type, newSL))
            trade.PositionModify(posInfo.Ticket(), newSL, curTP);
      }
   }
}

//====================================================================
//  DAILY STATE
//====================================================================
void ResetDailyState()
{
   dayStamp           = DateOfDay(TimeCurrent());
   dayStartEquity     = AccountInfoDouble(ACCOUNT_EQUITY);
   tradesToday        = 0;
   tradingHaltedToday = false;

   // A new day means a new opening range.
   rangeReady    = false;
   rangeRejected = false;
   rangeHigh     = 0.0;
   rangeLow      = 0.0;
   tookLong      = false;
   tookShort     = false;
   seenLongBreak = false;
   seenShortBreak= false;
}

void RollDailyStateIfNeeded()
{
   datetime today = DateOfDay(TimeCurrent());
   if(today != dayStamp)
   {
      statDayRolls++;
      ResetDailyState();
   }

   if(!tradingHaltedToday && dayStartEquity > 0)
   {
      double equity  = AccountInfoDouble(ACCOUNT_EQUITY);
      double lossPct = (dayStartEquity - equity) / dayStartEquity * 100.0;
      if(lossPct >= InpDailyLossCapPct)
      {
         tradingHaltedToday = true;
         PrintFormat("DAILY LOSS CAP hit: -%.2f%% (>= %.2f%%). No new trades today.",
                     lossPct, InpDailyLossCapPct);
      }
   }
}

//====================================================================
//  UTILITIES
//====================================================================
bool IsNewBar()
{
   datetime t = iTime(_Symbol, _Period, 0);
   if(t != lastBarTime) { lastBarTime = t; return true; }
   return false;
}

double GetAtr()
{
   double a[1];
   if(CopyBuffer(hAtr, 0, 0, 1, a) < 1) return 0.0;
   return a[0];
}

// Yesterday's ATR on D1 (shift 1 — the current day is still forming).
double GetDailyAtr()
{
   double a[1];
   if(CopyBuffer(hDailyAtr, 0, 1, 1, a) < 1) return 0.0;
   return a[0];
}

int CountEaPositions()
{
   int n = 0;
   for(int i = PositionsTotal()-1; i >= 0; i--)
   {
      if(!posInfo.SelectByIndex(i)) continue;
      if(posInfo.Symbol() == _Symbol && posInfo.Magic() == InpMagic) n++;
   }
   return n;
}

double NormalizeToTick(double price)
{
   double tick = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   if(tick <= 0) return NormalizeDouble(price, _Digits);
   return NormalizeDouble(MathRound(price/tick)*tick, _Digits);
}

bool RespectsStopLevel(int action, double entry, double sl, double tp)
{
   double point   = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
   long   stopLvl = SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL);
   double minDist = stopLvl * point;
   if(minDist <= 0) return true;
   return (MathAbs(entry - sl) >= minDist) && (MathAbs(entry - tp) >= minDist);
}

bool StopLevelOkForModify(long type, double newSL)
{
   double point   = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
   long   stopLvl = SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL);
   double minDist = stopLvl * point;
   if(minDist <= 0) return true;
   double ref = (type == POSITION_TYPE_BUY) ? SymbolInfoDouble(_Symbol, SYMBOL_BID)
                                            : SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   return MathAbs(ref - newSL) >= minDist;
}

int HourNow()
{
   MqlDateTime dt;
   TimeToStruct(TimeCurrent(), dt);
   return dt.hour;
}

bool IsFriday()
{
   MqlDateTime dt;
   TimeToStruct(TimeCurrent(), dt);
   return (dt.day_of_week == 5);
}

// Midnight of the day `t` falls in, via integer epoch arithmetic.
datetime DateOfDay(datetime t)
{
   return (datetime)(((long)t / 86400) * 86400);
}

//====================================================================
//  DIAGNOSTICS
//====================================================================
void PrintEntryFunnel()
{
   Print("================ ORB ENTRY FUNNEL ================");
   PrintFormat("Bars evaluated ............ %I64d", statBars);
   PrintFormat("Day rollovers (reset) ..... %I64d", statDayRolls);
   PrintFormat("Ranges built .............. %I64d", statRangesBuilt);
   PrintFormat("Ranges rejected (quality) . %I64d", statRangeRejected);
   PrintFormat("Breakouts detected ........ %I64d", statBreakouts);
   PrintFormat("TRADES OPENED ............. %I64d", statOpened);
   Print("--- rejections (first matching reason) ---");
   PrintFormat("DryRun .................... %I64d", statBlkDryRun);
   PrintFormat("daily loss cap ............ %I64d", statBlkDailyCap);
   PrintFormat("direction already traded .. %I64d", statBlkDirDone);
   PrintFormat("max trades/day ............ %I64d", statBlkMaxTrades);
   PrintFormat("max open positions ........ %I64d", statBlkMaxPos);
   PrintFormat("past last entry hour ...... %I64d", statBlkTooLate);
   PrintFormat("spread too wide ........... %I64d", statBlkSpread);
   PrintFormat("Friday filter ............. %I64d", statBlkFriday);
   Print("==================================================");
}
//+------------------------------------------------------------------+
