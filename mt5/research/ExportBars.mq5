//+------------------------------------------------------------------+
//|                                                  ExportBars.mq5   |
//|  Dumps the chart symbol's bar history to a CSV for offline        |
//|  robustness testing (research/orb_lab.py).                        |
//|                                                                   |
//|  Install: MQL5/Scripts/ExportBars.mq5, compile, drag onto an      |
//|  XAUUSD chart. Output: <Data folder>/MQL5/Files/<symbol>_<tf>.csv |
//|  (File -> Open Data Folder in the terminal).                      |
//+------------------------------------------------------------------+
#property script_show_inputs
#property strict

input ENUM_TIMEFRAMES InpTimeframe = PERIOD_M5;   // Bars to export (M5 matches the EA)
input datetime        InpFrom      = D'2010.01.01'; // Earliest date wanted (broker may have less)
input datetime        InpTo        = D'2030.01.01'; // Latest date (clamped to now)

void OnStart()
{
   string sym = _Symbol;
   datetime to = InpTo;
   if(to > TimeCurrent()) to = TimeCurrent();

   // Ask the server for the deepest history it has. The first call often only
   // starts the download, so poll until the bar count stops growing.
   int prev = -1, n = 0;
   for(int attempt = 0; attempt < 30; attempt++)
   {
      n = Bars(sym, InpTimeframe, InpFrom, to);
      if(n > 0 && n == prev) break;
      prev = n;
      MqlRates probe[];
      CopyRates(sym, InpTimeframe, InpFrom, to, probe);
      Sleep(1000);
   }
   if(n <= 0) { Print("ExportBars: no history for ", sym); return; }

   string fname = StringFormat("%s_%s.csv", sym, StringSubstr(EnumToString(InpTimeframe), 7));
   int fh = FileOpen(fname, FILE_WRITE | FILE_ANSI | FILE_TXT);
   if(fh == INVALID_HANDLE) { Print("ExportBars: cannot open ", fname, " err=", GetLastError()); return; }

   // Metadata the backtester needs to price the spread and size positions.
   FileWriteString(fh, StringFormat("#symbol=%s;point=%.10g;digits=%d;contract=%.10g;server_gmt_offset_h=%d\n",
                   sym,
                   SymbolInfoDouble(sym, SYMBOL_POINT),
                   (int)SymbolInfoInteger(sym, SYMBOL_DIGITS),
                   SymbolInfoDouble(sym, SYMBOL_TRADE_CONTRACT_SIZE),
                   (int)MathRound((double)(TimeTradeServer() - TimeGMT()) / 3600.0)));
   FileWriteString(fh, "time,open,high,low,close,spread\n");

   // Copy one calendar year at a time: a decade of M1 does not fit one array.
   long written = 0;
   datetime first = 0, last = 0;
   MqlDateTime d; TimeToStruct(InpFrom, d);
   for(int year = d.year; ; year++)
   {
      MqlDateTime a; ZeroMemory(a); a.year = year;     a.mon = 1; a.day = 1;
      MqlDateTime b; ZeroMemory(b); b.year = year + 1; b.mon = 1; b.day = 1;
      datetime ya = StructToTime(a);
      datetime yb = (datetime)((long)StructToTime(b) - 1);
      if(ya < InpFrom) ya = InpFrom;
      if(yb > to)      yb = to;
      if(ya > to) break;

      MqlRates r[];
      int got = CopyRates(sym, InpTimeframe, ya, yb, r);
      for(int i = 0; i < got; i++)
      {
         FileWriteString(fh, StringFormat("%I64d,%s,%s,%s,%s,%d\n",
                         (long)r[i].time,
                         DoubleToString(r[i].open,  _Digits), DoubleToString(r[i].high,  _Digits),
                         DoubleToString(r[i].low,   _Digits), DoubleToString(r[i].close, _Digits),
                         r[i].spread));
         if(first == 0) first = r[i].time;
         last = r[i].time;
      }
      if(got > 0) written += got;
   }
   FileClose(fh);

   PrintFormat("ExportBars: %I64d bars %s..%s -> MQL5/Files/%s",
               written, TimeToString(first), TimeToString(last), fname);
   Alert(StringFormat("Exported %I64d bars (%s .. %s) to MQL5/Files/%s",
                      written, TimeToString(first, TIME_DATE), TimeToString(last, TIME_DATE), fname));
}
