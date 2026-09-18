using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Text;
using System.Web.Script.Serialization;

namespace MkHub.SageCompanion.Hub
{
    public class HubQueueItem
    {
        public string attendance_id { get; set; }
        public string worker_id { get; set; }
        public string worker_name { get; set; }
        public string sage_employee_name { get; set; }
        public string work_date { get; set; }
        public string hours_hhmmss { get; set; }
        public object hours { get; set; }
        public string sage_item { get; set; }
        public string sage_customer { get; set; }
        public string sage_source_key { get; set; }
        public bool sage_urgent { get; set; }
        public string sage_state { get; set; }
    }

    public static class HubClient
    {
        static readonly JavaScriptSerializer Json = new JavaScriptSerializer();

        public static bool IsConfigured(AppConfig cfg)
        {
            return cfg != null
                && !string.IsNullOrWhiteSpace(cfg.HubBaseUrl)
                && !string.IsNullOrWhiteSpace(cfg.HubSecret);
        }

        public static List<HubQueueItem> GetQueue(AppConfig cfg)
        {
            var url = Join(cfg.HubBaseUrl, "/integrations/sage/queue?limit=50");
            var body = Request("GET", url, cfg.HubSecret, null);
            if (string.IsNullOrWhiteSpace(body) || body == "[]")
                return new List<HubQueueItem>();
            var items = Json.Deserialize<List<HubQueueItem>>(body);
            return items ?? new List<HubQueueItem>();
        }

        public static void Ack(AppConfig cfg, string attendanceId, string state, string recId, string error)
        {
            var url = Join(cfg.HubBaseUrl, "/integrations/sage/ack");
            var payload = new Dictionary<string, object>();
            payload["attendance_id"] = attendanceId;
            payload["state"] = state;
            if (!string.IsNullOrWhiteSpace(recId)) payload["sage_rec_id"] = recId;
            if (!string.IsNullOrWhiteSpace(error)) payload["error"] = error;
            Request("POST", url, cfg.HubSecret, Json.Serialize(payload));
        }

        static string Join(string baseUrl, string path)
        {
            return (baseUrl ?? "").TrimEnd('/') + path;
        }

        static string Request(string method, string url, string secret, string jsonBody)
        {
            var req = (HttpWebRequest)WebRequest.Create(url);
            req.Method = method;
            req.Timeout = 30000;
            req.Headers["X-Sage-Companion-Secret"] = secret ?? "";
            req.Accept = "application/json";
            if (jsonBody != null)
            {
                var bytes = Encoding.UTF8.GetBytes(jsonBody);
                req.ContentType = "application/json; charset=utf-8";
                req.ContentLength = bytes.Length;
                using (var s = req.GetRequestStream())
                    s.Write(bytes, 0, bytes.Length);
            }
            try
            {
                using (var resp = (HttpWebResponse)req.GetResponse())
                using (var reader = new StreamReader(resp.GetResponseStream(), Encoding.UTF8))
                    return reader.ReadToEnd();
            }
            catch (WebException ex)
            {
                var detail = "";
                if (ex.Response != null)
                {
                    using (var reader = new StreamReader(ex.Response.GetResponseStream(), Encoding.UTF8))
                        detail = reader.ReadToEnd();
                }
                var http = ex.Response as HttpWebResponse;
                var code = http != null ? ((int)http.StatusCode).ToString() : "error";
                throw new InvalidOperationException("MKHub " + method + " " + url + " failed (" + code + "): " + (detail.Length > 300 ? detail.Substring(0, 300) : detail));
            }
        }
    }
}
