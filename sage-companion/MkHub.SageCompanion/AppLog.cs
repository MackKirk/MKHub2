using System;
using System.IO;
using System.Text;

namespace MkHub.SageCompanion
{
    public static class AppLog
    {
        static readonly object Gate = new object();
        static string _path;

        public static event Action<string> Line;

        public static string LogPath
        {
            get { return _path; }
        }

        public static void Init()
        {
            var dir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
                "MKHub",
                "SageCompanion");
            Directory.CreateDirectory(dir);
            _path = Path.Combine(dir, "companion.log");
        }

        public static void Info(string message)
        {
            Write("INFO", message);
        }

        public static void Error(string message)
        {
            Write("ERROR", message);
        }

        static void Write(string level, string message)
        {
            var line = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + " [" + level + "] " + message;
            try
            {
                if (!string.IsNullOrEmpty(_path))
                {
                    lock (Gate)
                    {
                        File.AppendAllText(_path, line + Environment.NewLine, Encoding.UTF8);
                    }
                }
            }
            catch { }
            var handler = Line;
            if (handler != null) handler(line);
        }
    }
}
