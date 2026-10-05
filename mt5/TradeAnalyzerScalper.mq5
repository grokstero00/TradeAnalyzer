//+------------------------------------------------------------------+
//|                                        TradeAnalyzerScalper.mq5   |
//|   High-frequency mean-reversion scalper for XAUUSD (gold), M1.    |
//|                                                                  |
//|   Premise: on a one-minute scale price overshoots on order-flow   |
//|   imbalance and partially retraces. When price closes an unusual  |
//|   distance from a fast EMA, fade it back toward the mean with a   |
//|   tight stop and a time limit. This is a documented microstructure|
//|   effect, not a claim of a proven edge.                          |
//|                                                                  |
//|   READ THIS BEFORE TRADING IT: scalping gold is the most          |
//|   cost-hostile configuration there is. The spread is a fixed toll |
//|   paid on every trade while the profit target shrinks with the    |
//|   timeframe. This EA therefore reports, at startup, the win rate  |
//|   required just to break even at the CURRENT spread, and totals   |
//|   the spread actually paid over a run. Read both numbers before   |
//|   believing any equity curve it produces.                        |
//|                                                                  |
//|   Risk shell is the one measured in TradeAnalyzerORB: sizing via  |
//|   OrderCalcProfit, daily loss cap, and an entry-funnel diagnostic.|
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
input long   InpMagic         = 20260810;   // Magic number (isolates this EA's trades)
input bool   InpDryRun        = false;      // DryRun: log signals, place NO orders
input string InpTradeComment  = "Scalp";

//--- Signal: fade an extension away from a fast EMA
input group "=== Signal (extension fade) ==="
input int    InpEmaPeriod     = 20;         // Fast EMA the price is measured against
input int    InpAtrPeriod     = 14;         // ATR period (chart timeframe)
input double InpExtensionAtr  = 1.5;        // Fade when price is this many ATR from the EMA
input bool   InpRequireStall  = true;       // Also require the extension bar to stall (smaller body)

//--- Exits
input group "=== Exits ==="
input double InpTargetAtrMult = 1.0;        // Take-profit distance = this * ATR
input double InpStopAtrMult   = 1.2;        // Stop distance = this * ATR
input int    InpMaxBarsInTrade= 15;         // Time stop: close after this many bars, win or lose

//--- Cost control (the part that decides whether scalping is viable)
input group "=== Cost control ==="
input double InpMaxSpreadPctOfTarget = 15.0; // Skip entry if spread exceeds this % of the target

//--- Risk & money management
input group "=== Risk management ==="
input double InpRiskPercent    = 0.25;      // Risk per trade, % of balance (lower: many trades)
input double InpMaxLot         = 5.0;       // Hard cap on lot size
input double InpMaxLotPer10k   = 0.10;      // Exposure cap: max lot per $10k equity (0 = off)
input double InpDailyLossCapPct= 3.0;       // Stop trading for the day after this % equity loss
input int    InpMaxTradesPerDay= 20;        // Max NEW trades opened per day
input int    InpMaxOpenPos     = 1;         // Max simultaneous positions from this EA
input int    InpCooldownBars   = 3;         // Bars to wait after an exit before re-entering

//--- Session filter: trade only when the book is deep
input group "=== Session (server time) ==="
input bool   InpUseSession     = true;      // Restrict trading to liquid hours
input int    InpSessionStartH  = 10;        // Start hour (10 = London open on a GMT+3 server)
input int    InpSessionEndH    = 22;        // End hour
input bool   InpCloseAtSessionEnd = true;   // Flatten all EA positions at session end
input bool   InpNoFriday       = false;     // Do not open new trades on Friday

//====================================================================
//  GLOBALS
//====================================================================
CTrade         trade;
CPositionInfo  posInfo;

int hEma, hAtr;

datetime lastBarTime   = 0;
datetime dayStamp      = 0;
double   dayStartEquity= 0.0;
int      tradesToday   = 0;
bool     tradingHaltedToday = false;
datetime lastCloseTime = 0;
int      prevPosCount  = 0;

// --- Diagnostics ---
long   statBars=0, statDayRolls=0, statSignals=0, statOpened=0;
long   statBlkDryRun=0, statBlkDailyCap=0, statBlkMaxTrades=0, statBlkMaxPos=0;
long   statBlkCooldown=0, statBlkSpread=0, statBlkSession=0, statBlkFriday=0;
long   statTimeStops=0;
double statSpreadPaid=0.0;   // cumulative money handed over as spread

//====================================================================
//  INIT / DEINIT
//====================================================================
int OnInit()
{
   trade.SetExpertMagicNumber(InpMagic);
   trade.SetDeviationInPoints(10);
   trade.SetTypeFillingBySymbol(_Symbol);

   hEma = iMA (_Symbol, _Period, InpEmaPeriod, 0, MODE_EMA, PRICE_CLOSE);
   hAtr = iATR(_Symbol, _Period, InpAtrPeriod);
   if(hEma == INVALID_HANDLE || hAtr == INVALID_HANDLE)
   {
      Print("ERROR: failed to create indicator handle(s).");
      return(INIT_FAILED);
   }

   ResetDailyState();

   PrintFormat("TradeAnalyzerScalper started on %s %s | DryRun=%s | Risk=%.2f%%",
               _Symbol, EnumToString((ENUM_TIMEFRAMES)_Period),
               (InpDryRun?"YES":"NO"), InpRiskPercent);

   ReportCostHurdle();

   if(!InpDryRun && !MQLInfoInteger(MQL_TESTER) &&
      AccountInfoInteger(ACCOUNT_TRADE_MODE) == ACCOUNT_TRADE_MODE_REAL)
      Print("WARNING: live trading is ENABLED on a REAL account.");

   return(INIT_SUCCEEDED);
}

// The single most useful number for a scalper, printed before the first trade:
// given the current spread and the configured stop/target, what win rate does
// the strategy need just to break even? Compare it against any win rate the
// backtest reports. If the two are close, the "edge" is inside the noise.
void ReportCostHurdle()
{
   double atr = GetAtr();
   if(atr <= 0)
   {
      Print("COST HURDLE: ATR not ready yet — re-check after a few bars.");
      return;
   }

   double target = atr * InpTargetAtrMult;
   double stop   = atr * InpStopAtrMult;
   double spread = (double)SymbolInfoInteger(_Symbol, SYMBOL_SPREAD)
                 * SymbolInfoDouble(_Symbol, SYMBOL_POINT);

   // The spread is paid on entry, so it shrinks every win and deepens every loss.
   double win  = target - spread;
   double loss = stop   + spread;

   Print("---------- COST HURDLE ----------");
   PrintFormat("ATR(%d) on %s ......... %.2f", InpAtrPeriod, EnumToString((ENUM_TIMEFRAMES)_Period), atr);
   PrintFormat("Target / stop ......... %.2f / %.2f", target, stop);
   PrintFormat("Current spread ........ %.2f  (%.1f%% of target)", spread,
               (target > 0 ? spread/target*100.0 : 0.0));
   if(win <= 0)
   {
      Print("Spread EXCEEDS the target: every winning trade still loses money.");
      Print("This configuration cannot be profitable. Widen the target or drop the idea.");
   }
   else
   {
      double beIdeal = stop / (target + stop);
      double beReal  = loss / (win + loss);
      PrintFormat("Break-even win rate ... %.1f%% ignoring spread", beIdeal*100.0);
      PrintFormat("Break-even win rate ... %.1f%% WITH spread  <-- the real hurdle", beReal*100.0);
      PrintFormat("Spread costs you ...... %.1f percentage points of win rate",
                  (beReal-beIdeal)*100.0);
   }
   Print("---------------------------------");
}

void OnDeinit(const int reason)
{
   IndicatorRelease(hEma);
   IndicatorRelease(hAtr);
   PrintFunnel();
}

double OnTester()
{
   PrintFunnel();
   return 0.0;
}

//====================================================================
//  MAIN LOOP
//====================================================================
void OnTick()
{
   RollDailyStateIfNeeded();
   ManageOpenPositions();
   TrackFlatTransition();

   if(!IsNewBar())
      return;

   statBars++;

   int action = FadeSignal();
   if(action == 0)
      return;

   statSignals++;

   string block = "";
   if(!CanOpenNewTrade(action, block))
   {
      if(block != "")
         PrintFormat("Entry blocked: %s", block);
      return;
   }

   if(OpenTrade(action))
      statOpened++;
}

//====================================================================
//  SIGNAL
//====================================================================
// +1 buy the dip below the EMA, -1 sell the spike above it, 0 nothing.
int FadeSignal()
{
   double ema[1], atrBuf[1];
   if(CopyBuffer(hEma, 0, 1, 1, ema)    < 1) return 0;
   if(CopyBuffer(hAtr, 0, 1, 1, atrBuf) < 1) return 0;

   double atr = atrBuf[0];
   if(atr <= 0) return 0;

   double close = iClose(_Symbol, _Period, 1);
   double open  = iOpen (_Symbol, _Period, 1);
   double high  = iHigh (_Symbol, _Period, 1);
   double low   = iLow  (_Symbol, _Period, 1);
   if(close <= 0) return 0;

   double extension = close - ema[0];
   double threshold = atr * InpExtensionAtr;

   int dir = 0;
   if(extension >  threshold) dir = -1;   // stretched above the mean -> fade down
   if(extension < -threshold) dir =  1;   // stretched below the mean -> fade up
   if(dir == 0) return 0;

   // Optional confirmation: fade a move that is running out of steam, not one
   // still accelerating. A bar whose body is small relative to its range has
   // met resistance — entering into a full-bodied thrust is how fades get run over.
   if(InpRequireStall)
   {
      double range = high - low;
      if(range <= 0) return 0;
      double body = MathAbs(close - open);
      if(body / range > 0.6) return 0;    // still thrusting; stand aside
   }

   return dir;
}

//====================================================================
//  ENTRY GATING
//====================================================================
bool CanOpenNewTrade(int action, string &block)
{
   block = "";

   if(InpDryRun)                 { statBlkDryRun++;   block = "DryRun mode (no orders)"; return false; }
   if(tradingHaltedToday)        { statBlkDailyCap++; block = "daily loss cap hit";      return false; }
   if(tradesToday >= InpMaxTradesPerDay)   { statBlkMaxTrades++; block = "max trades/day reached";     return false; }
   if(CountEaPositions() >= InpMaxOpenPos) { statBlkMaxPos++;    block = "max open positions reached"; return false; }

   if(InpCooldownBars > 0 && lastCloseTime > 0)
   {
      int barsSince = iBarShift(_Symbol, _Period, lastCloseTime, false);
      if(barsSince < InpCooldownBars)
      { statBlkCooldown++; block = "cooldown after last exit"; return false; }
   }

   // Cost gate. On a scalp the spread is not a detail, it is the main opponent.
   double atr = GetAtr();
   if(atr > 0)
   {
      double target = atr * InpTargetAtrMult;
      double spread = (double)SymbolInfoInteger(_Symbol, SYMBOL_SPREAD)
                    * SymbolInfoDouble(_Symbol, SYMBOL_POINT);
      double pct    = (target > 0) ? spread/target*100.0 : 100.0;
      if(pct > InpMaxSpreadPctOfTarget)
      { statBlkSpread++; block = StringFormat("spread %.1f%% of target > max %.1f%%", pct, InpMaxSpreadPctOfTarget); return false; }
   }

   if(InpUseSession && !InSession()) { statBlkSession++; block = "outside trading session"; return false; }
   if(InpNoFriday && IsFriday())     { statBlkFriday++;  block = "no-Friday filter";        return false; }

   return true;
}

//====================================================================
//  ORDER PLACEMENT
//====================================================================
bool OpenTrade(int action)
{
   double atr = GetAtr();
   if(atr <= 0) { Print("Cannot open: ATR unavailable."); return false; }

   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);

   double entry, sl, tp;
   if(action > 0)
   {
      entry = ask;
      sl    = entry - atr * InpStopAtrMult;
      tp    = entry + atr * InpTargetAtrMult;
   }
   else
   {
      entry = bid;
      sl    = entry + atr * InpStopAtrMult;
      tp    = entry - atr * InpTargetAtrMult;
   }

   sl = NormalizeToTick(sl);
   tp = NormalizeToTick(tp);

   if(!RespectsStopLevel(entry, sl, tp))
   { Print("Cannot open: SL/TP inside broker's stop level."); return false; }

   double lot = CalcLotByRisk(action, entry, sl);
   if(lot <= 0) return false;

   bool ok;
   if(action > 0) ok = trade.Buy (lot, _Symbol, 0.0, sl, tp, InpTradeComment);
   else           ok = trade.Sell(lot, _Symbol, 0.0, sl, tp, InpTradeComment);

   if(ok)
   {
      tradesToday++;
      // Record what this trade handed to the broker before it even started.
      double spreadCost = MoneyBetween(action, ask, bid, lot);
      statSpreadPaid += spreadCost;

      double plannedLoss = MoneyBetween(action, entry, sl, lot);
      double equity = AccountInfoDouble(ACCOUNT_EQUITY);
      PrintFormat("OPEN %s lot=%.2f entry~%.2f SL=%.2f TP=%.2f | risk=$%.2f (%.2f%%) | spread cost=$%.2f",
                  (action>0?"BUY":"SELL"), lot, entry, sl, tp, plannedLoss,
                  (equity>0 ? plannedLoss/equity*100.0 : 0.0), spreadCost);
   }
   else
      PrintFormat("Order FAILED: retcode=%d %s", trade.ResultRetcode(), trade.ResultRetcodeDescription());

   return ok;
}

// Money a position of `lot` gains/loses moving between two prices, per the
// broker's own contract math. Returned positive.
double MoneyBetween(int action, double from, double to, double lot)
{
   ENUM_ORDER_TYPE ot = (action > 0) ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
   double profit = 0.0;
   if(!OrderCalcProfit(ot, _Symbol, lot, from, to, profit))
      return 0.0;
   return MathAbs(profit);
}

double CalcLotByRisk(int action, double entry, double sl)
{
   double riskMoney = AccountInfoDouble(ACCOUNT_BALANCE) * InpRiskPercent / 100.0;

   double lossPerLot = MoneyBetween(action, entry, sl, 1.0);
   if(lossPerLot <= 0.0) { Print("Cannot size: OrderCalcProfit returned <= 0."); return 0.0; }

   double lot = riskMoney / lossPerLot;

   if(InpMaxLotPer10k > 0)
   {
      double lotCap = InpMaxLotPer10k * (AccountInfoDouble(ACCOUNT_EQUITY) / 10000.0);
      if(lot > lotCap) lot = lotCap;
   }

   double minLot = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double maxLot = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   double step   = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);

   if(step > 0) lot = MathFloor(lot/step) * step;
   lot = MathMin(lot, MathMin(maxLot, InpMaxLot));
   if(lot < minLot)
   {
      PrintFormat("SKIP: balance too small for %.2f%% risk (min lot %.2f).", InpRiskPercent, minLot);
      return 0.0;
   }
   return lot;
}

//====================================================================
//  POSITION MANAGEMENT
//====================================================================
void ManageOpenPositions()
{
   bool flatten = (InpUseSession && InpCloseAtSessionEnd && !InSession());

   for(int i = PositionsTotal()-1; i >= 0; i--)
   {
      if(!posInfo.SelectByIndex(i)) continue;
      if(posInfo.Symbol() != _Symbol) continue;
      if(posInfo.Magic()  != InpMagic) continue;

      if(flatten)
      {
         trade.PositionClose(posInfo.Ticket());
         continue;
      }

      // Time stop. A scalp that has not resolved within a few bars has failed
      // its premise: the snap-back did not happen. Holding on turns a scalp
      // into an unplanned swing trade, which is how scalpers take their worst
      // losses. Close it and free the slot.
      if(InpMaxBarsInTrade > 0)
      {
         int barsHeld = iBarShift(_Symbol, _Period, posInfo.Time(), false);
         if(barsHeld >= InpMaxBarsInTrade)
         {
            trade.PositionClose(posInfo.Ticket());
            statTimeStops++;
            PrintFormat("Time stop: closed #%I64u after %d bars", posInfo.Ticket(), barsHeld);
         }
      }
   }
}

void TrackFlatTransition()
{
   int nowPos = CountEaPositions();
   if(prevPosCount > 0 && nowPos == 0)
      lastCloseTime = iTime(_Symbol, _Period, 0);
   prevPosCount = nowPos;
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
}

void RollDailyStateIfNeeded()
{
   datetime today = DateOfDay(TimeCurrent());
   if(today != dayStamp) { statDayRolls++; ResetDailyState(); }

   if(!tradingHaltedToday && dayStartEquity > 0)
   {
      double equity  = AccountInfoDouble(ACCOUNT_EQUITY);
      double lossPct = (dayStartEquity - equity) / dayStartEquity * 100.0;
      if(lossPct >= InpDailyLossCapPct)
      {
         tradingHaltedToday = true;
         PrintFormat("DAILY LOSS CAP hit: -%.2f%%. No new trades today.", lossPct);
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

bool RespectsStopLevel(double entry, double sl, double tp)
{
   double point   = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
   long   stopLvl = SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL);
   double minDist = stopLvl * point;
   if(minDist <= 0) return true;
   return (MathAbs(entry - sl) >= minDist) && (MathAbs(entry - tp) >= minDist);
}

bool InSession()
{
   MqlDateTime dt;
   TimeToStruct(TimeCurrent(), dt);
   int h = dt.hour;
   if(InpSessionStartH <= InpSessionEndH)
      return (h >= InpSessionStartH && h < InpSessionEndH);
   return (h >= InpSessionStartH || h < InpSessionEndH);
}

bool IsFriday()
{
   MqlDateTime dt;
   TimeToStruct(TimeCurrent(), dt);
   return (dt.day_of_week == 5);
}

datetime DateOfDay(datetime t)
{
   return (datetime)(((long)t / 86400) * 86400);
}

//====================================================================
//  DIAGNOSTICS
//====================================================================
void PrintFunnel()
{
   Print("============ SCALPER ENTRY FUNNEL ============");
   PrintFormat("Bars evaluated ............ %I64d", statBars);
   PrintFormat("Day rollovers ............. %I64d", statDayRolls);
   PrintFormat("Fade signals .............. %I64d", statSignals);
   PrintFormat("TRADES OPENED ............. %I64d", statOpened);
   PrintFormat("Closed by time stop ....... %I64d", statTimeStops);
   Print("--- rejections (first matching reason) ---");
   PrintFormat("DryRun .................... %I64d", statBlkDryRun);
   PrintFormat("daily loss cap ............ %I64d", statBlkDailyCap);
   PrintFormat("max trades/day ............ %I64d", statBlkMaxTrades);
   PrintFormat("max open positions ........ %I64d", statBlkMaxPos);
   PrintFormat("cooldown .................. %I64d", statBlkCooldown);
   PrintFormat("spread too wide ........... %I64d", statBlkSpread);
   PrintFormat("outside session ........... %I64d", statBlkSession);
   PrintFormat("Friday filter ............. %I64d", statBlkFriday);
   Print("--- what the frequency cost you ---");
   PrintFormat("TOTAL SPREAD PAID ......... $%.2f", statSpreadPaid);
   Print("Compare this with the net profit in the report. If net profit is the");
   Print("smaller number, the strategy is transferring your capital to the broker.");
   Print("==============================================");
}
//+------------------------------------------------------------------+
