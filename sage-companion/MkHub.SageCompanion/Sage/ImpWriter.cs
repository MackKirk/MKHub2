using System.Collections.Generic;
using System.IO;
using System.Text;

namespace MkHub.SageCompanion.Sage
{
    public class TimeslipRow
    {
        public string Employee;
        public string SlipNo;
        public string Date;
        public string Customer;
        public string Item;
        public string Hours;
    }

    public static class ImpWriter
    {
        public static string Build(string employee, string slipNo, string date, string customer, string item, string hours)
        {
            var rows = new List<TimeslipRow>();
            rows.Add(new TimeslipRow
            {
                Employee = employee,
                SlipNo = slipNo,
                Date = date,
                Customer = customer,
                Item = item,
                Hours = hours
            });
            return BuildBatch(rows);
        }

        public static string BuildBatch(IList<TimeslipRow> rows)
        {
            var sb = new StringBuilder();
            sb.AppendLine("<Version>");
            sb.AppendLine("\"12001\", \"1\"");
            sb.AppendLine("</Version>");
            if (rows == null) return sb.ToString();
            for (int i = 0; i < rows.Count; i++)
            {
                var r = rows[i];
                sb.AppendLine("<Timeslip>");
                sb.AppendLine("\"" + Escape(r.Employee) + "\"");
                sb.AppendLine("\"1\",\"" + Escape(r.SlipNo) + "\",\"" + Escape(r.Date) + "\"");
                sb.AppendLine("\"" + Escape(r.Customer) + "\",\"" + Escape(r.Item) + "\",\"" + Escape(r.Hours) + "\"");
                sb.AppendLine("</Timeslip>");
            }
            return sb.ToString();
        }

        public static void WriteFile(string path, string employee, string slipNo, string date, string customer, string item, string hours)
        {
            File.WriteAllText(path, Build(employee, slipNo, date, customer, item, hours), Encoding.ASCII);
        }

        public static void WriteBatch(string path, IList<TimeslipRow> rows)
        {
            File.WriteAllText(path, BuildBatch(rows), Encoding.ASCII);
        }

        static string Escape(string s)
        {
            return (s ?? "").Replace("\"", "'");
        }

        public static string NewSlipNumber()
        {
            var n = "MKH" + System.DateTime.Now.ToString("yyMMddHHmmss");
            if (n.Length > 20) n = n.Substring(0, 20);
            return n;
        }

        public static string NormalizeHours(string hours)
        {
            var raw = (hours ?? "").Trim();
            if (raw.Length == 0) return "01:00:00";
            double n;
            if (double.TryParse(raw, out n) && raw.IndexOf(':') < 0)
            {
                if (n < 0) n = 0;
                var totalSeconds = (int)System.Math.Round(n * 3600);
                var h = totalSeconds / 3600;
                var m = (totalSeconds % 3600) / 60;
                var s = totalSeconds % 60;
                return h.ToString("00") + ":" + m.ToString("00") + ":" + s.ToString("00");
            }
            return raw;
        }
    }
}
