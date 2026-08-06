//+------------------------------------------------------------------+
//|                                             TradeAnalyzerEA.mq5   |
//|   Weighted-vote day-trading EA tuned for XAUUSD (gold).          |
//|                                                                  |
//|   Ports the transparent BUY/SELL/HOLD "signal engine" from the  |
//|   TradeAnalyzer backend (RSI + SMA-cross + MACD + Bollinger with |
//|   a trend-regime filter) into MT5, and wraps it in a strict      |
//|   risk-management shell: %-of-balance position sizing, ATR       |
//|   stop/target, daily loss cap, max trades/day, spread & session  |
//|   filters, break-even and ATR trailing.                          |
//|                                                                  |
//|   NOT financial advice. Test on DEMO first. DryRun defaults ON.  |
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
input long   InpMagic          = 20260805;   // Magic number (isolates this EA's trades)
input bool   InpDryRun         = true;        // DryRun: compute & log signals, place NO orders
input bool   InpTradeOnNewBar  = true;        // Evaluate only on new closed bar (recommended)
input string InpTradeComment   = "TradeAnalyzerEA";

//--- Signal engine (mirrors backend DEFAULT_CONFIG)
input group "=== Signal engine ==="
input int    InpRsiPeriod      = 14;          // RSI period
input double InpRsiOversold    = 30.0;        // RSI oversold
input double InpRsiOverbought  = 70.0;        // RSI overbought
input int    InpSmaShort       = 20;          // SMA short (trend)
input int    InpSmaLong        = 50;          // SMA long (trend)
input int    InpBbPeriod       = 20;          // Bollinger period
input double InpBbMult         = 2.0;         // Bollinger std-dev multiplier
input int    InpMacdFast       = 12;          // MACD fast EMA
input int    InpMacdSlow       = 26;          // MACD slow EMA
input int    InpMacdSignal     = 9;           // MACD signal EMA
input double InpHoldThreshold  = 0.15;        // |score| below this => HOLD (0..1)

//--- Risk & money management
input group "=== Risk management ==="
input double InpRiskPercent    = 0.5;         // Risk per trade, % of balance
input int    InpAtrPeriod      = 14;          // ATR period (stop distance)
input double InpAtrStopMult    = 1.5;         // Stop distance = ATR * this
input double InpRewardRisk     = 2.0;         // Take-profit = risk * this (RR)
input double InpMaxLot         = 5.0;         // Hard cap on lot size (broker units)
input double InpMaxLotPer10k   = 0.10;        // Exposure cap: max lot per $10k equity (0 = off)
input double InpDailyLossCapPct= 3.0;         // Stop trading for the day after this % equity loss
input int    InpMaxTradesPerDay= 5;           // Max NEW trades opened per day
input int    InpMaxOpenPos     = 1;           // Max simultaneous positions from this EA

//--- Signal quality (reduce over-trading)
input group "=== Signal quality ==="
input bool   InpRequireFreshCross = true;     // Enter only on a fresh SMA/MACD cross (not weak trend lean)
input int    InpCooldownBars      = 2;        // Bars to wait after a position closes before re-entering

//--- Trade management
input group "=== Trade management ==="
input bool   InpUseBreakEven   = true;        // Move SL to entry after some profit
input double InpBreakEvenAtR   = 1.0;         // Trigger break-even at this R (multiple of risk)
input bool   InpUseTrailing    = true;        // ATR trailing stop
input double InpTrailAtrMult   = 2.0;         // Trailing distance = ATR * this
input bool   InpCloseOnOpposite= false;       // Close on opposite signal (market exit; can exceed planned risk)

//--- Higher-timeframe trend filter
input group "=== Higher-timeframe trend filter ==="
input bool            InpUseHtfFilter = true;             // Only trade in the direction of the HTF trend
input ENUM_TIMEFRAMES InpHtfTimeframe = PERIOD_H1;        // Higher timeframe for the trend gate
input int             InpHtfMaPeriod  = 200;              // SMA period on the higher timeframe

//--- Filters (tuned for XAUUSD)
input group "=== Filters (gold) ==="
input double InpMaxSpreadPoints= 60.0;        // Skip entries when spread (points) exceeds this
input bool   InpUseSession     = true;        // Restrict trading to an intraday session window
input int    InpSessionStartH  = 7;           // Session start hour (server time, 0-23)
input int    InpSessionEndH    = 20;          // Session end hour (server time, 0-23)
input bool   InpCloseAtSessionEnd = true;     // Flatten all EA positions at session end
input bool   InpNoFriday       = false;       // Do not open new trades on Friday

//====================================================================
//  GLOBALS
//====================================================================
CTrade         trade;
CPositionInfo  posInfo;

int hRsi, hSmaShort, hSmaLong, hMacd, hBands, hAtr, hHtfMa;

datetime lastBarTime  = 0;
datetime dayStamp     = 0;        // start-of-day marker for daily counters
double   dayStartEquity = 0.0;
int      tradesToday  = 0;
bool     tradingHaltedToday = false;
datetime lastCloseTime = 0;       // bar time when this EA last went flat (for cooldown)
int      prevPosCount  = 0;       // EA positions seen on the previous tick

//====================================================================
//  INIT / DEINIT
//====================================================================
int OnInit()
{
   trade.SetExpertMagicNumber(InpMagic);
   trade.SetDeviationInPoints(20);
   trade.SetTypeFillingBySymbol(_Symbol);

   hRsi      = iRSI(_Symbol, _Period, InpRsiPeriod, PRICE_CLOSE);
   hSmaShort = iMA (_Symbol, _Period, InpSmaShort, 0, MODE_SMA, PRICE_CLOSE);
   hSmaLong  = iMA (_Symbol, _Period, InpSmaLong,  0, MODE_SMA, PRICE_CLOSE);
   hMacd     = iMACD(_Symbol, _Period, InpMacdFast, InpMacdSlow, InpMacdSignal, PRICE_CLOSE);
   hBands    = iBands(_Symbol, _Period, InpBbPeriod, 0, InpBbMult, PRICE_CLOSE);
   hAtr      = iATR (_Symbol, _Period, InpAtrPeriod);
   hHtfMa    = iMA (_Symbol, InpHtfTimeframe, InpHtfMaPeriod, 0, MODE_SMA, PRICE_CLOSE);

   if(hRsi==INVALID_HANDLE || hSmaShort==INVALID_HANDLE || hSmaLong==INVALID_HANDLE ||
      hMacd==INVALID_HANDLE || hBands==INVALID_HANDLE || hAtr==INVALID_HANDLE ||
      hHtfMa==INVALID_HANDLE)
   {
      Print("ERROR: failed to create one or more indicator handles.");
      return(INIT_FAILED);
   }

   if(InpSmaLong <= InpSmaShort)
      Print("WARN: SmaLong should be > SmaShort for a meaningful trend filter.");

   ResetDailyState();

   PrintFormat("TradeAnalyzerEA started on %s %s | DryRun=%s | Risk=%.2f%% | RR=%.1f",
               _Symbol, EnumToString((ENUM_TIMEFRAMES)_Period),
               (InpDryRun?"YES":"NO"), InpRiskPercent, InpRewardRisk);
   if(StringFind(_Symbol, "XAU") < 0)
      Print("NOTE: this EA is tuned for XAUUSD (gold). Review filters for other symbols.");

   return(INIT_SUCCEEDED);
}

void OnDeinit(const int reason)
{
   IndicatorRelease(hRsi);
   IndicatorRelease(hSmaShort);
   IndicatorRelease(hSmaLong);
   IndicatorRelease(hMacd);
   IndicatorRelease(hBands);
   IndicatorRelease(hAtr);
   IndicatorRelease(hHtfMa);
}

//====================================================================
//  MAIN LOOP
//====================================================================
void OnTick()
{
   RollDailyStateIfNeeded();

   // Manage existing positions every tick (trailing / BE / session flatten).
   ManageOpenPositions();

   // Track flat<->in-market transitions so the cooldown knows when we last exited.
   TrackFlatTransition();

   if(InpTradeOnNewBar && !IsNewBar())
      return;

   // ---- Compute the signal on the just-closed bar ----
   int    action  = 0;         // +1 BUY, -1 SELL, 0 HOLD
   double score   = 0.0;
   string why     = "";
   int    convDir = 0;         // +1/-1 if a fresh SMA/MACD cross this bar, else 0
   if(!ComputeSignal(action, score, why, convDir))
      return;                  // not enough data yet

   PrintFormat("Signal: %s (score=%.3f, conv=%d) | %s",
               (action>0?"BUY":action<0?"SELL":"HOLD"), score, convDir, why);

   // ---- Optionally close on opposite signal ----
   if(InpCloseOnOpposite && action != 0)
      CloseOppositePositions(action);

   if(action == 0)
      return;

   // ---- Conviction filter: only enter on a fresh cross, not a weak trend lean ----
   if(InpRequireFreshCross && convDir != action)
   {
      PrintFormat("Entry blocked: no fresh cross in %s direction (conviction gate)",
                  (action>0?"BUY":"SELL"));
      return;
   }

   // ---- Entry gating ----
   string block = "";
   if(!CanOpenNewTrade(action, block))
   {
      if(block != "")
         PrintFormat("Entry blocked: %s", block);
      return;
   }

   OpenTrade(action, score, why);
}

// Detect the moment this EA goes flat and stamp the current bar time, so the
// cooldown filter can require N bars before the next entry.
void TrackFlatTransition()
{
   int nowPos = CountEaPositions();
   if(prevPosCount > 0 && nowPos == 0)
      lastCloseTime = iTime(_Symbol, _Period, 0);
   prevPosCount = nowPos;
}

//====================================================================
//  SIGNAL ENGINE  (ported from backend/signals/signalEngine.ts)
//====================================================================
// Returns false if indicator data isn't ready yet.
bool ComputeSignal(int &action, double &score, string &why, int &convDir)
{
   action = 0; score = 0.0; why = ""; convDir = 0;

   // Evaluate on the just-closed bar when trading on new bars (shift=1), or on
   // the current forming bar otherwise (shift=0). Reading price and every
   // indicator at the SAME shift keeps them consistent.
   int shift = InpTradeOnNewBar ? 1 : 0;

   // arr[0] = bar at `shift` (current), arr[1] = bar at `shift+1` (previous).
   double rsi[2], smaS[2], smaL[2], macdMain[2], macdSig[2];
   double bUp[2], bLo[2];

   if(CopyBuffer(hRsi,     0, shift, 2, rsi)     < 2) return false;
   if(CopyBuffer(hSmaShort,0, shift, 2, smaS)    < 2) return false;
   if(CopyBuffer(hSmaLong, 0, shift, 2, smaL)    < 2) return false;
   if(CopyBuffer(hMacd,    0, shift, 2, macdMain)< 2) return false;  // MACD main line
   if(CopyBuffer(hMacd,    1, shift, 2, macdSig) < 2) return false;  // signal line
   if(CopyBuffer(hBands,   1, shift, 2, bUp)     < 2) return false;  // upper
   if(CopyBuffer(hBands,   2, shift, 2, bLo)     < 2) return false;  // lower

   double price = iClose(_Symbol, _Period, shift);
   if(price <= 0) price = SymbolInfoDouble(_Symbol, SYMBOL_BID);

   // MACD histogram = main - signal (matches backend's histogram concept).
   double hist  = macdMain[0] - macdSig[0];
   double histP = macdMain[1] - macdSig[1];

   // --- Trend direction: short vs long SMA ---
   int trendDir = 0;
   if(smaS[0] > smaL[0]) trendDir = 1; else if(smaS[0] < smaL[0]) trendDir = -1;

   // --- Individual votes (dir, weight, name, isMeanReversion) ---
   int    vDir[4];
   double vW[4];
   string vName[4];
   bool   vMeanRev[4];
   string reasons = "";

   // RSI
   VoteRSI(rsi[0], vDir[0], vW[0], reasons);
   vName[0]="RSI"; vMeanRev[0]=true;

   // SMA cross
   VoteSmaCross(smaS[0], smaL[0], smaS[1], smaL[1], vDir[1], vW[1], reasons);
   vName[1]="SMA_CROSS"; vMeanRev[1]=false;

   // MACD
   VoteMacd(hist, histP, vDir[2], vW[2], reasons);
   vName[2]="MACD"; vMeanRev[2]=false;

   // Bollinger
   VoteBollinger(price, bUp[0], bLo[0], vDir[3], vW[3], reasons);
   vName[3]="BOLLINGER"; vMeanRev[3]=true;

   // --- Trend-regime filter: damp counter-trend mean-reversion votes ---
   const double COUNTER_TREND_DAMPING = 0.25;
   if(trendDir != 0)
   {
      for(int i=0; i<4; i++)
      {
         if(!vMeanRev[i] || vDir[i]==0) continue;
         if(vDir[i] != trendDir)
            vW[i] *= COUNTER_TREND_DAMPING;
      }
   }

   // --- Conviction direction: require an actual SMA 20/50 cross this bar.
   // A fresh SMA cross carries weight 0.9 (a mere trend "lean" is 0.35). MACD is
   // deliberately excluded: its histogram flips through zero several times a day
   // on M15 gold, which made the conviction gate far too permissive (hundreds of
   // trades). The SMA regime change is a rare, meaningful event — exactly what a
   // low-frequency, low-risk day-trader wants as an entry trigger.
   convDir = (vW[1] >= 0.75) ? vDir[1] : 0;   // vName[1] == "SMA_CROSS"

   // --- Aggregate ---
   double weighted = 0.0, totalW = 0.0;
   for(int i=0; i<4; i++)
   {
      weighted += vDir[i] * vW[i];
      totalW   += vW[i];
   }
   score = (totalW > 0.0) ? weighted / totalW : 0.0;

   if(score >  InpHoldThreshold) action = 1;
   else if(score < -InpHoldThreshold) action = -1;
   else action = 0;

   why = StringFormat("trend=%d; %s", trendDir, reasons);
   return true;
}

//--- Vote helpers ---------------------------------------------------
void VoteRSI(double value, int &dir, double &w, string &reasons)
{
   if(value <= InpRsiOversold)
   {
      dir = 1;
      w = Clamp01((InpRsiOversold - value)/InpRsiOversold + 0.4);
      reasons += StringFormat("RSI %.1f oversold; ", value);
   }
   else if(value >= InpRsiOverbought)
   {
      dir = -1;
      w = Clamp01((value - InpRsiOverbought)/(100.0 - InpRsiOverbought) + 0.4);
      reasons += StringFormat("RSI %.1f overbought; ", value);
   }
   else { dir = 0; w = 0.1; }
}

void VoteSmaCross(double s, double l, double sPrev, double lPrev, int &dir, double &w, string &reasons)
{
   bool crossedUp   = (sPrev <= lPrev && s > l);
   bool crossedDown = (sPrev >= lPrev && s < l);
   if(crossedUp)      { dir=1;  w=0.9; reasons+="Golden cross; "; }
   else if(crossedDown){ dir=-1; w=0.9; reasons+="Death cross; "; }
   else if(s > l)     { dir=1;  w=0.35; }
   else if(s < l)     { dir=-1; w=0.35; }
   else               { dir=0;  w=0.1; }
}

void VoteMacd(double h, double hPrev, int &dir, double &w, string &reasons)
{
   bool up   = (hPrev <= 0 && h > 0);
   bool down = (hPrev >= 0 && h < 0);
   if(up)        { dir=1;  w=0.8; reasons+="MACD cross up; "; }
   else if(down) { dir=-1; w=0.8; reasons+="MACD cross down; "; }
   else if(h > 0){ dir=1;  w=0.3; }
   else if(h < 0){ dir=-1; w=0.3; }
   else          { dir=0;  w=0.1; }
}

void VoteBollinger(double price, double upper, double lower, int &dir, double &w, string &reasons)
{
   if(price <= lower)      { dir=1;  w=0.6; reasons+="At lower band; "; }
   else if(price >= upper) { dir=-1; w=0.6; reasons+="At upper band; "; }
   else                    { dir=0;  w=0.1; }
}

//====================================================================
//  ENTRY GATING
//====================================================================
bool CanOpenNewTrade(int action, string &block)
{
   block = "";

   if(InpDryRun)                { block = "DryRun mode (no orders)"; return false; }
   if(tradingHaltedToday)       { block = "daily loss cap hit";      return false; }
   if(tradesToday >= InpMaxTradesPerDay) { block = "max trades/day reached"; return false; }
   if(CountEaPositions() >= InpMaxOpenPos){ block = "max open positions reached"; return false; }

   // Cooldown after the last exit (avoid immediately re-entering into chop).
   if(InpCooldownBars > 0 && lastCloseTime > 0)
   {
      int barsSince = iBarShift(_Symbol, _Period, lastCloseTime, false);
      if(barsSince < InpCooldownBars)
      { block = StringFormat("cooldown (%d/%d bars since last exit)", barsSince, InpCooldownBars); return false; }
   }

   // Spread filter
   double spread = (double)SymbolInfoInteger(_Symbol, SYMBOL_SPREAD);
   if(spread > InpMaxSpreadPoints)
   { block = StringFormat("spread %.0f > max %.0f", spread, InpMaxSpreadPoints); return false; }

   // Session filter
   if(InpUseSession && !InSession())      { block = "outside trading session"; return false; }

   // Friday filter
   if(InpNoFriday && IsFriday())          { block = "no-Friday filter";        return false; }

   // Higher-timeframe trend filter: only trade with the bigger trend.
   if(InpUseHtfFilter)
   {
      int htf = HtfTrendDir();
      if(htf == 0)          { block = "HTF trend not ready";                    return false; }
      if(htf != action)     { block = "against higher-timeframe trend";         return false; }
   }

   return true;
}

// +1 if price is above the higher-timeframe SMA (uptrend), -1 below, 0 unknown.
int HtfTrendDir()
{
   double ma[1];
   if(CopyBuffer(hHtfMa, 0, 0, 1, ma) < 1) return 0;
   double price = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   if(price <= 0 || ma[0] <= 0) return 0;
   if(price > ma[0]) return 1;
   if(price < ma[0]) return -1;
   return 0;
}

//====================================================================
//  ORDER PLACEMENT
//====================================================================
void OpenTrade(int action, double score, string why)
{
   double atr = GetAtr();
   if(atr <= 0) { Print("Cannot open: ATR unavailable."); return; }

   double stopDist = atr * InpAtrStopMult;
   double tpDist   = stopDist * InpRewardRisk;

   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);

   double entry, sl, tp;
   if(action > 0) { entry = ask; sl = entry - stopDist; tp = entry + tpDist; }
   else           { entry = bid; sl = entry + stopDist; tp = entry - tpDist; }

   sl = NormalizeToTick(sl);
   tp = NormalizeToTick(tp);

   // Respect broker's minimum stop distance.
   if(!RespectsStopLevel(action, entry, sl, tp))
   { Print("Cannot open: SL/TP inside broker's stop level."); return; }

   double lot = CalcLotByRisk(action, entry, sl);
   if(lot <= 0) { Print("Cannot open: computed lot <= 0."); return; }

   // Actual money at risk for this exact order, per the broker's own math.
   double plannedLoss = MoneyRisk(action, entry, sl, lot);

   string cmt = StringFormat("%s score=%.2f", InpTradeComment, score);
   bool ok;
   if(action > 0) ok = trade.Buy(lot, _Symbol, 0.0, sl, tp, cmt);
   else           ok = trade.Sell(lot, _Symbol, 0.0, sl, tp, cmt);

   if(ok)
   {
      tradesToday++;
      double equity = AccountInfoDouble(ACCOUNT_EQUITY);
      PrintFormat("OPEN %s lot=%.2f entry~%.2f SL=%.2f TP=%.2f | risk=$%.2f (%.2f%% of equity) | %s",
                  (action>0?"BUY":"SELL"), lot, entry, sl, tp,
                  plannedLoss, (equity>0 ? plannedLoss/equity*100.0 : 0.0), why);
   }
   else
   {
      PrintFormat("Order FAILED: retcode=%d %s", trade.ResultRetcode(), trade.ResultRetcodeDescription());
   }
}

// Money that a position of `lot` would lose going from `entry` to `sl`, using
// the broker's own contract math (handles gold, indices, FX, any symbol).
double MoneyRisk(int action, double entry, double sl, double lot)
{
   ENUM_ORDER_TYPE ot = (action > 0) ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
   double profit = 0.0;
   if(!OrderCalcProfit(ot, _Symbol, lot, entry, sl, profit))
      return 0.0;
   return MathAbs(profit);   // entry->SL is a loss; report it positive
}

//--- Position sizing: risk % of balance across the stop distance ----
double CalcLotByRisk(int action, double entry, double sl)
{
   double balance   = AccountInfoDouble(ACCOUNT_BALANCE);
   double riskMoney = balance * InpRiskPercent / 100.0;

   // Ask the terminal how much 1.0 lot loses from entry to the stop. This is
   // the authoritative contract math — far more reliable across brokers than
   // hand-rolled TICK_VALUE / TICK_SIZE arithmetic (which mis-sized gold on
   // some feeds, producing ~3x the intended risk).
   double lossPerLot = MoneyRisk(action, entry, sl, 1.0);
   if(lossPerLot <= 0.0)
   {
      Print("Cannot size: OrderCalcProfit returned <= 0 for 1 lot.");
      return 0.0;
   }

   double lot = riskMoney / lossPerLot;

   // --- Exposure cap independent of ATR ---
   // When ATR is small the stop is tight and the risk-based lot explodes. If
   // such an oversized position ever exits away from its stop (opposite-signal
   // market close, session flatten, slippage/gap), the loss far exceeds the
   // planned %-risk. Cap the lot to a fraction of equity so the worst case
   // stays bounded regardless of ATR.
   if(InpMaxLotPer10k > 0)
   {
      double equity = AccountInfoDouble(ACCOUNT_EQUITY);
      double lotCap = InpMaxLotPer10k * (equity / 10000.0);
      if(lot > lotCap)
      {
         PrintFormat("Lot %.2f capped to %.2f by exposure limit (%.2f lot/$10k, ATR-driven size too large).",
                     lot, lotCap, InpMaxLotPer10k);
         lot = lotCap;
      }
   }

   // Clamp to broker constraints and our hard cap.
   double minLot = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double maxLot = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   double step   = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);

   if(step > 0) lot = MathFloor(lot/step) * step;
   lot = MathMin(lot, MathMin(maxLot, InpMaxLot));
   if(lot < minLot)
   {
      // The min lot would risk MORE than our target %. Refuse rather than
      // silently over-risk. On gold the min lot (0.01) risks ~$10-20 at a
      // typical stop, so small accounts can't honor a 0.5% target — this is a
      // balance-too-small situation, not a bug.
      double minLotRisk = MoneyRisk(action, entry, sl, minLot);
      PrintFormat("SKIP: balance too small for %.2f%% risk on %s. Min lot %.2f would risk $%.2f, but target is $%.2f. Increase balance or raise RiskPercent.",
                  InpRiskPercent, _Symbol, minLot, minLotRisk, riskMoney);
      return 0.0;
   }
   return lot;
}

//====================================================================
//  POSITION MANAGEMENT (trailing / break-even / session flatten)
//====================================================================
void ManageOpenPositions()
{
   bool flatten = (InpUseSession && InpCloseAtSessionEnd && !InSession());
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

      long   type   = posInfo.PositionType();
      double open   = posInfo.PriceOpen();
      double curSL  = posInfo.StopLoss();
      double curTP  = posInfo.TakeProfit();
      double bid    = SymbolInfoDouble(_Symbol, SYMBOL_BID);
      double ask    = SymbolInfoDouble(_Symbol, SYMBOL_ASK);

      double newSL = curSL;

      // Risk distance implied by original stop (fallback to ATR stop if none).
      double riskDist = (curSL > 0) ? MathAbs(open - curSL) : atr * InpAtrStopMult;

      // --- Break-even ---
      if(InpUseBreakEven && riskDist > 0)
      {
         if(type == POSITION_TYPE_BUY)
         {
            double profit = bid - open;
            if(profit >= riskDist * InpBreakEvenAtR && (curSL < open))
               newSL = MathMax(newSL, open);
         }
         else
         {
            double profit = open - ask;
            if(profit >= riskDist * InpBreakEvenAtR && (curSL > open || curSL == 0))
               newSL = (newSL == 0) ? open : MathMin(newSL, open);
         }
      }

      // --- ATR trailing ---
      if(InpUseTrailing && atr > 0)
      {
         double trail = atr * InpTrailAtrMult;
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
         // Only tighten (never loosen) and respect stop level.
         bool improves = (type == POSITION_TYPE_BUY) ? (newSL > curSL || curSL == 0)
                                                      : (newSL < curSL || curSL == 0);
         if(improves && StopLevelOkForModify(type, newSL))
            trade.PositionModify(posInfo.Ticket(), newSL, curTP);
      }
   }
}

void CloseOppositePositions(int action)
{
   for(int i = PositionsTotal()-1; i >= 0; i--)
   {
      if(!posInfo.SelectByIndex(i)) continue;
      if(posInfo.Symbol() != _Symbol) continue;
      if(posInfo.Magic()  != InpMagic) continue;

      long type = posInfo.PositionType();
      bool opposite = (action > 0 && type == POSITION_TYPE_SELL) ||
                      (action < 0 && type == POSITION_TYPE_BUY);
      if(opposite)
      {
         if(InpDryRun)
            PrintFormat("[DryRun] would close opposite #%I64u", posInfo.Ticket());
         else
         {
            trade.PositionClose(posInfo.Ticket());
            PrintFormat("Closed opposite position #%I64u on signal flip", posInfo.Ticket());
         }
      }
   }
}

//====================================================================
//  DAILY STATE
//====================================================================
void ResetDailyState()
{
   dayStamp            = DateOfDay(TimeCurrent());
   dayStartEquity      = AccountInfoDouble(ACCOUNT_EQUITY);
   tradesToday         = 0;
   tradingHaltedToday  = false;
}

void RollDailyStateIfNeeded()
{
   datetime today = DateOfDay(TimeCurrent());
   if(today != dayStamp)
      ResetDailyState();

   // Daily loss cap on equity.
   if(!tradingHaltedToday && dayStartEquity > 0)
   {
      double equity = AccountInfoDouble(ACCOUNT_EQUITY);
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

// Ensure SL/TP are beyond the broker's minimum stop distance from entry.
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

bool InSession()
{
   MqlDateTime dt;
   TimeToStruct(TimeCurrent(), dt);
   int h = dt.hour;
   if(InpSessionStartH <= InpSessionEndH)
      return (h >= InpSessionStartH && h < InpSessionEndH);
   // Overnight window (start > end), e.g. 22 -> 6
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
   MqlDateTime dt;
   TimeToStruct(t, dt);
   dt.hour = 0; dt.min = 0; dt.sec = 0;
   return StructToTime(dt);
}

double Clamp01(double x)
{
   if(x < 0.0) return 0.0;
   if(x > 1.0) return 1.0;
   return x;
}
//+------------------------------------------------------------------+
