// DeepSeek Harness Tray — lightweight C# tray implementation (~10MB RAM)
// Protocol-compatible with the PowerShell version (DeepSeek Harness Tray.ps1):
//   - same mutex (Local\DeepSeekHarnessTray) => they cannot run at the same time
//   - same settings file (dsh-tray-settings.json: visible / trayScript self-report)
//   - same marker file (%TEMP%\dsh-open.request) and log file (dsh-tray.log)
// Build (offline, .NET Framework 4.8 csc):
//   csc /nologo /target:winexe /out:"DeepSeek Harness Tray.exe"
//       /r:System.Windows.Forms.dll /r:System.Drawing.dll
//       /win32icon:"DeepSeek Harness.ico" DeepSeekHarnessTray.cs
// Args: -NoBrowser  (do not auto-open the web page on boot)
//       -Port <n>   (default 3080)
using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

static class DshTray {
    // ---- constants ----
    const string MUTEX_NAME = "Local\\DeepSeekHarnessTray";
    const string SETTINGS_NAME = "dsh-tray-settings.json";
    const string LOG_NAME = "dsh-tray.log";
    const string MARKER_NAME = "dsh-open.request";
    const string TRAY_EXE = "DeepSeek Harness Tray.exe";
    const int PORT = 3080;
    const int OPEN_DEBOUNCE_MS = 60000;

    // DeepSeek brand blue #4D6BFE, dim variant, and stop-state colors
    //（停止图标跟随系统主题：浅色主题=黑、深色主题=白，保证任务栏可见性）
    static readonly Color BLUE = Color.FromArgb(77, 107, 254);
    static readonly Color BLUE_DIM = Color.FromArgb(31, 43, 102);
    static readonly Color BLACK = Color.FromArgb(0, 0, 0);
    static readonly Color WHITE = Color.FromArgb(255, 255, 255);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern uint SetErrorMode(uint uMode);

    static string BaseDir;
    static string SettingsPath;
    static string LogPath;
    static bool NoBrowser;
    static bool NoService; // -NoService：仅托盘模式，启动时不自动启动/接管服务（开机自启用）
    static int Port = PORT;

    static Mutex mutex;
    static NotifyIcon notify;
    static ContextMenuStrip menu;
    static System.Windows.Forms.Timer stateTimer;
    static System.Windows.Forms.Timer flashTimer;

    static Icon iconNormal;      // original (from exe resource)
    static Icon iconBlue;        // running state (DeepSeek blue)
    static Icon iconBlack;       // stopped state (light theme)
    static Icon iconWhite;       // stopped state (dark theme)
    static Icon iconBlueDim;     // starting flash
    static Bitmap blueBmp, blackBmp, whiteBmp, dimBmp;

    static bool darkTheme;       // 系统深色主题（AppsUseLightTheme=0）

    static int serverPid;
    static bool serverStarting;
    // 后台探测线程维护的端口状态缓存：UI 线程（Tick/菜单）只读此缓存，
    // 绝不阻塞 —— connect 到无监听端口在本机实测需 ~2s（SYN 被丢弃而非 RST），
    // 若在 UI 线程同步探测，服务停止时右键/菜单会被冻结。
    static volatile bool upCached;
    static string startReason = "";
    static int startAttempts;
    static DateTime? startTime;
    static DateTime lastOpenTime;
    static bool? lastUp;
    static bool visibleSetting = true;
    // 弹窗开关（插件面板可配，存 dsh-tray-settings.json）：只保留启动/停止两类气泡
    static bool notifyStartSetting = true;
    static bool notifyStopSetting = true;
    static string dshVersion = "";

    static string CliPath {
        get {
            var p = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "npm\\node_modules\\@deepseek-ai\\dsh\\lib\\bin.js");
            return File.Exists(p) ? p : null;
        }
    }

    // ---- log ----
    static void Log(string msg) {
        try {
            File.AppendAllText(LogPath,
                "[" + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "] " + msg + "\r\n",
                new UTF8Encoding(false));
        } catch { }
    }

    // ---- tiny JSON helpers (our own file format only) ----
    static string JsonEscape(string s) {
        return s.Replace("\\", "\\\\").Replace("\"", "\\\"");
    }
    // 读取全部插件设置：visible（图标显示/隐藏）+ notifyStart/notifyStop（弹窗开关）
    static void RefreshSettings() {
        try {
            if (File.Exists(SettingsPath)) {
                var text = File.ReadAllText(SettingsPath, Encoding.UTF8);
                var m = Regex.Match(text, "\"visible\"\\s*:\\s*(true|false)");
                if (m.Success) visibleSetting = m.Groups[1].Value == "true";
                m = Regex.Match(text, "\"notifyStart\"\\s*:\\s*(true|false)");
                if (m.Success) notifyStartSetting = m.Groups[1].Value == "true";
                m = Regex.Match(text, "\"notifyStop\"\\s*:\\s*(true|false)");
                if (m.Success) notifyStopSetting = m.Groups[1].Value == "true";
            }
        } catch { }
    }
    static void SelfReport() {
        // 启动时自报：内存值 = Main 里刚 RefreshSettings 读到的插件设置（最新），
        // 直接写全字段即可（若此时合并现有文件，删键易产生尾逗号损坏 JSON）。
        // UTF-8 无 BOM（插件 JSON.parse 不剥 BOM）。
        try {
            var payload = "{ \"visible\": " + (visibleSetting ? "true" : "false") +
                ", \"notifyStart\": " + (notifyStartSetting ? "true" : "false") +
                ", \"notifyStop\": " + (notifyStopSetting ? "true" : "false") +
                ", \"trayScript\": \"" + JsonEscape(Application.ExecutablePath) + "\" }";
            File.WriteAllText(SettingsPath, payload, new UTF8Encoding(false));
        } catch { }
    }

    // ---- icons ----
    static Bitmap TintIcon(Icon src, Color color) {
        var bmp = src.ToBitmap();
        var outBmp = new Bitmap(bmp.Width, bmp.Height, bmp.PixelFormat);
        for (int x = 0; x < bmp.Width; x++)
            for (int y = 0; y < bmp.Height; y++) {
                var px = bmp.GetPixel(x, y);
                if (px.A > 0) outBmp.SetPixel(x, y, Color.FromArgb(px.A, color));
                else outBmp.SetPixel(x, y, px);
            }
        bmp.Dispose();
        return outBmp;
    }
    static Icon IconFromBitmap(Bitmap b) { return Icon.FromHandle(b.GetHicon()); }

    // 系统主题：AppsUseLightTheme=0 → 深色（停止图标用白色）；1/缺失 → 浅色（用黑色）
    static bool IsDarkTheme() {
        try {
            using (var key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize")) {
                if (key != null) {
                    var v = key.GetValue("AppsUseLightTheme");
                    if (v is int) return (int)v == 0;
                }
            }
        } catch { }
        return false;
    }
    // 主题变化检测（Tick 内调用）：变化后强制重绘停止态图标
    static void ApplyTheme() {
        bool d = IsDarkTheme();
        if (d != darkTheme) {
            darkTheme = d;
            lastUp = null; // 强制 ApplyIcon 重设图标
            Log("系统主题变化：" + (d ? "深色" : "浅色"));
        }
    }

    // ---- service control ----
    // 带 500ms 超时的端口探测：成功 0ms；失败（无监听）本机实测需 ~2s 才返回，
    // 超时保证任何调用方（含 UI 线程）最多等 500ms。
    static bool ServerUp() {
        try {
            var c = new TcpClient();
            try {
                var ar = c.BeginConnect("127.0.0.1", Port, null, null);
                if (!ar.AsyncWaitHandle.WaitOne(500)) return false;
                c.EndConnect(ar);
                return true;
            } finally { c.Close(); }
        } catch { return false; }
    }

    // 后台探测线程：每 2s 刷新 upCached，UI 永不因探测阻塞。
    static void ProbeLoop() {
        while (true) {
            try { upCached = ServerUp(); } catch { }
            Thread.Sleep(2000);
        }
    }

    /// Find the PID listening on 127.0.0.1:Port via netstat (fallback when
    /// we did not spawn the server ourselves, e.g. adopted an existing one).
    static int FindServerPid() {
        try {
            var psi = new ProcessStartInfo("netstat", "-ano") {
                UseShellExecute = false, CreateNoWindow = true, WindowStyle = ProcessWindowStyle.Hidden,
                RedirectStandardOutput = true, StandardOutputEncoding = Encoding.ASCII
            };
            var p = Process.Start(psi);
            var outText = p.StandardOutput.ReadToEnd();
            p.WaitForExit(5000);
            foreach (var line in outText.Split('\n')) {
                var m = Regex.Match(line, "TCP\\s+127\\.0\\.0\\.1:" + Port + "\\s+\\S+\\s+LISTENING\\s+(\\d+)");
                if (m.Success) {
                    int pid;
                    if (int.TryParse(m.Groups[1].Value, out pid) && pid > 0) return pid;
                }
            }
        } catch { }
        return 0;
    }

    static void StartServer() {
        try {
            var cli = CliPath;
            if (string.IsNullOrEmpty(cli)) { Log("未找到 dsh CLI (lib/bin.js)"); return; }
            var psi = new ProcessStartInfo("node", "\"" + cli + "\" web --port " + Port) {
                WorkingDirectory = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden
            };
            var p = Process.Start(psi);
            serverPid = p.Id;
            serverStarting = true;
            startReason = "启动";
            startAttempts = 1;
            startTime = DateTime.Now;
        } catch (Exception e) { Log("启动服务异常: " + e.Message); }
    }

    static void StopServer() {
        // 用自己启动的 pid；未追踪（接管场景）则按端口查 owner
        int pid = serverPid;
        if (pid <= 0) pid = FindServerPid();
        if (pid > 0) {
            try {
                var psi = new ProcessStartInfo("cmd.exe", "/c taskkill /PID " + pid + " /T /F >nul 2>&1") {
                    UseShellExecute = false, CreateNoWindow = true, WindowStyle = ProcessWindowStyle.Hidden
                };
                Process.Start(psi);
            } catch { }
        }
        serverPid = 0;
        serverStarting = false;
        upCached = false; // 本地立即反映停止，等探测线程确认
    }

    static void OpenWebNow() {
        // 直接打开（绕过防抖）：菜单「打开网页」等明确主动操作永远响应
        lastOpenTime = DateTime.Now;
        try { Process.Start("http://127.0.0.1:" + Port); } catch { }
    }

    static void OpenWeb() {
        // 防抖打开：自动打开后 60s 内双击等重复触发不重复开标签
        if (NoBrowser) return;
        if ((DateTime.Now - lastOpenTime).TotalMilliseconds < OPEN_DEBOUNCE_MS) {
            Log("打开网页已抑制（防抖窗口内）");
            return;
        }
        OpenWebNow();
    }

    static bool pendingOpen; // 服务未运行时点「打开网页」：启动完成后再开

    static void OpenAction(bool bypassDebounce) {
        Log("打开网页");
        if (!ServerUp()) {
            if (!serverStarting) { Log("服务未运行，异步启动服务"); StartServer(); }
            pendingOpen = true; // 就绪后自动打开（避免浏览器先看到连接失败）
        } else {
            if (bypassDebounce) OpenWebNow(); else OpenWeb();
        }
    }

    // ---- menu state ----
    static ToolStripMenuItem miOpen, miStart, miStop, miRestart, miStatus, miVersion, miHelp, miExit;
    static void UpdateMenuState() {
        bool up = upCached;
        if (serverStarting) {
            miStart.Enabled = miStop.Enabled = miRestart.Enabled = false;
            miStatus.Text = "服务状态：启动中…";
        } else {
            miStart.Enabled = !up;
            miStop.Enabled = up;
            miRestart.Enabled = up;
            miStatus.Text = up ? "服务状态：运行中" : "服务状态：已停止";
        }
    }

    static void ApplyIcon(bool up) {
        try {
            if (serverStarting) {
                if (!flashTimer.Enabled) flashTimer.Start();
                // 闪烁首帧=暗蓝（先暗蓝后蓝）；后续由 FlashTick 交替
                if (notify.Icon != iconBlue && notify.Icon != iconBlueDim) notify.Icon = iconBlueDim;
            } else {
                if (flashTimer.Enabled) flashTimer.Stop();
                if (lastUp != up) {
                    lastUp = up;
                    // 运行=蓝；停止=按系统主题（浅色=黑 / 深色=白）；启动中=蓝/暗蓝闪烁
                    if (iconBlue != null && iconBlack != null && iconWhite != null) {
                        notify.Icon = up ? iconBlue : (darkTheme ? iconWhite : iconBlack);
                    }
                }
            }
        } catch { }
    }

    static void ApplySettings() {
        RefreshSettings();
        if (notify.Visible != visibleSetting) notify.Visible = visibleSetting;
    }

    static void Tick() {
        try {
            ApplyTheme(); // 检测系统主题变化（每 3s，读注册表开销可忽略）
            bool up = upCached;
            if (serverStarting) {
                if (up) {
                    // completed
                    var reason = startReason;
                    serverStarting = false; startReason = ""; startAttempts = 0; startTime = null;
                    Log("服务已就绪（" + reason + ", port=" + Port + "）");
                    if (pendingOpen) { pendingOpen = false; OpenWebNow(); } // 就绪后补开（防抖无关）
                    if (notifyStartSetting) {
                        try {
                            notify.ShowBalloonTip(3000, "DeepSeek Harness",
                                (reason == "重启" ? "服务已重启：" : "服务已启动：") + "http://127.0.0.1:" + Port, ToolTipIcon.Info);
                        } catch { }
                    }
                } else {
                    bool alive = serverPid > 0;
                    try { alive = Process.GetProcessById(serverPid) != null; } catch { alive = false; }
                    if (!alive) {
                        if (startAttempts < 3) {
                            startAttempts++;
                            Log("服务进程已退出，重新拉起（第 " + startAttempts + " 次）");
                            StartServer();
                        } else {
                            Log("服务启动失败（已重试 3 次）");
                            serverStarting = false; startAttempts = 0; startTime = null;
                        }
                    } else if (startTime != null && (DateTime.Now - startTime.Value).TotalSeconds > 90) {
                        Log("服务启动超时（90 秒）");
                        serverStarting = false; startAttempts = 0; startTime = null;
                    }
                }
            }
            // tooltip
            if (serverStarting) notify.Text = "DeepSeek Harness — 服务启动中…";
            else if (up) notify.Text = "DeepSeek Harness — 运行中 http://127.0.0.1:" + Port;
            else notify.Text = "DeepSeek Harness — 服务已停止，点「打开网页」可重启";
            ApplyIcon(up);
            if (!menu.Visible) UpdateMenuState();
            ApplySettings();
            // marker (second launcher instance asks us to open the page)
            var marker = Path.Combine(Path.GetTempPath(), MARKER_NAME);
            if (File.Exists(marker)) {
                try { File.Delete(marker); } catch { }
                OpenAction(false); // 标记触发走防抖
            }
        } catch { }
    }

    static void FlashTick() {
        try {
            if (!serverStarting) { flashTimer.Stop(); return; }
            if (iconBlue == null || iconBlueDim == null) return;
            notify.Icon = notify.Icon == iconBlue ? iconBlueDim : iconBlue;
        } catch { }
    }

    [STAThread]
    static void Main(string[] args) {
        SetErrorMode(0x8001); // SEM_FAILCRITICALERRORS|SEM_NOGPFAULTERRORBOX|SEM_NOOPENFILEERRORBOX
        for (int i = 0; i < args.Length; i++) {
            if (args[i] == "-NoBrowser") NoBrowser = true;
            else if (args[i] == "-NoService") NoService = true;
            else if (args[i] == "-Port" && i + 1 < args.Length) int.TryParse(args[++i], out Port);
        }
        BaseDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\');
        SettingsPath = Path.Combine(BaseDir, SETTINGS_NAME);
        LogPath = Path.Combine(BaseDir, LOG_NAME);
        RefreshSettings();

        mutex = new Mutex(false, MUTEX_NAME);
        if (!mutex.WaitOne(0)) {
            // another tray is running: just open the page (like the PS version)
            try { Process.Start("http://127.0.0.1:" + Port); } catch { }
            return;
        }
        Log("托盘启动 (port=" + Port + ")");

        // dsh version from the official npm package
        try {
            var pkg = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "npm\\node_modules\\@deepseek-ai\\dsh\\package.json");
            if (File.Exists(pkg)) {
                var m = Regex.Match(File.ReadAllText(pkg, Encoding.UTF8), "\"version\"\\s*:\\s*\"([^\"]+)\"");
                if (m.Success) dshVersion = "v" + m.Groups[1].Value;
            }
        } catch { }

        // icons：运行=蓝 tint；停止=黑/白 tint（按系统主题）；启动闪烁=蓝/暗蓝
        iconNormal = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        darkTheme = IsDarkTheme();
        try {
            blueBmp = TintIcon(iconNormal, BLUE); iconBlue = IconFromBitmap(blueBmp);
            blackBmp = TintIcon(iconNormal, BLACK); iconBlack = IconFromBitmap(blackBmp);
            whiteBmp = TintIcon(iconNormal, WHITE); iconWhite = IconFromBitmap(whiteBmp);
            dimBmp = TintIcon(iconNormal, BLUE_DIM); iconBlueDim = IconFromBitmap(dimBmp);
        } catch { iconBlue = iconBlack = iconWhite = iconBlueDim = null; }

        notify = new NotifyIcon();
        notify.Icon = iconBlue;
        notify.Text = "DeepSeek Harness — 运行中";
        notify.Visible = visibleSetting;

        menu = new ContextMenuStrip();
        menu.AutoClose = true;
        miOpen = new ToolStripMenuItem("打开网页");
        miStart = new ToolStripMenuItem("启动服务");
        miStop = new ToolStripMenuItem("停止服务");
        miRestart = new ToolStripMenuItem("重启服务");
        miStatus = new ToolStripMenuItem("服务状态：运行中") { Enabled = false };
        miVersion = new ToolStripMenuItem("dsh 版本：" + dshVersion) { Enabled = false };
        miHelp = new ToolStripMenuItem("使用说明");
        miExit = new ToolStripMenuItem("退出");
        menu.Items.Add(miOpen); menu.Items.Add(miStart); menu.Items.Add(miStop); menu.Items.Add(miRestart);
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(miStatus); menu.Items.Add(miVersion); menu.Items.Add(miHelp);
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(miExit);
        notify.ContextMenuStrip = menu;

        miOpen.Click += (s, e) => OpenAction(true); // 菜单=明确主动操作，绕过防抖
        notify.MouseDoubleClick += (s, e) => { if (e.Button == MouseButtons.Left) OpenAction(false); };
        miStart.Click += (s, e) => {
            if (!ServerUp() && !serverStarting) { Log("菜单操作：启动服务"); startReason = "启动"; StartServer(); }
            UpdateMenuState();
        };
        miStop.Click += (s, e) => {
            Log("菜单操作：停止服务");
            StopServer();
            if (notifyStopSetting) {
                try { notify.ShowBalloonTip(3000, "DeepSeek Harness", "服务已停止。", ToolTipIcon.Info); } catch { }
            }
            UpdateMenuState();
        };
        miRestart.Click += (s, e) => {
            Log("菜单操作：重启服务");
            StopServer();
            System.Threading.Thread.Sleep(500);
            startReason = "重启";
            StartServer();
            UpdateMenuState();
        };
        miHelp.Click += (s, e) => {
            var md = Path.Combine(BaseDir, "使用说明.md");
            try { if (File.Exists(md)) Process.Start(md); else Process.Start("notepad.exe", md); } catch { }
        };
        miExit.Click += (s, e) => {
            Log("托盘退出：正在停止服务");
            notify.Visible = false;
            notify.Dispose();
            StopServer();
            Log("托盘退出：服务已停止");
            try { mutex.ReleaseMutex(); } catch { }
            Application.Exit();
        };

        stateTimer = new System.Windows.Forms.Timer();
        stateTimer.Interval = 3000;
        stateTimer.Tick += (s, e) => Tick();
        stateTimer.Start();

        flashTimer = new System.Windows.Forms.Timer();
        flashTimer.Interval = 500;
        flashTimer.Tick += (s, e) => FlashTick();

        // adopt the running server if any (startup; blocking wait like the PS main flow)
        if (NoService) {
            // 仅托盘模式（开机自启）：不启动/接管服务，服务由用户双击托盘或菜单启动
            Log("仅托盘模式（-NoService）：不自动启动服务");
        } else if (!ServerUp()) {
            Log("正在启动 dsh web 服务...");
            StartServer();
            // wait up to 60s (no UI interaction needed yet)
            DateTime deadline = DateTime.Now.AddSeconds(60);
            while (DateTime.Now < deadline && serverStarting && !ServerUp())
                System.Threading.Thread.Sleep(500);
            if (ServerUp()) {
                serverStarting = false; startAttempts = 0; startTime = null;
                Log("服务启动成功 (port=" + Port + ")");
            } else {
                Log("服务启动失败，托盘退出");
                try { mutex.ReleaseMutex(); } catch { }
                return;
            }
        } else {
            Log("服务已在运行，直接使用 (port=" + Port + ")");
            serverPid = FindServerPid(); // 记录现有服务 pid，停止/重启时才有效
        }

        upCached = ServerUp(); // 首次缓存当前端口状态（一次性，≤500ms）
        new Thread(ProbeLoop) { IsBackground = true }.Start(); // 后台探测，UI 零阻塞
        lastUp = null;
        ApplyIcon(upCached); // 初始图标：运行=蓝 / 停止=黑

        SelfReport();
        // auto open the web page on manual boot (not with -NoBrowser)
        if (!NoBrowser) { lastOpenTime = DateTime.Now; Process.Start("http://127.0.0.1:" + Port); }

        Application.Run();
        stateTimer.Stop();
        try { flashTimer.Stop(); } catch { }
        notify.Visible = false;
        notify.Dispose();
        try { mutex.ReleaseMutex(); } catch { }
    }
}
