window.__ModuleLoader__.load({ id: "dsh-tray-manager", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  dshMobile: () => dshMobile,
  en: () => en,
  inject: () => inject,
  zh: () => zh
});
module.exports = __toCommonJS(index_exports);

// src/client/TrayManagerView.tsx
var import_react = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
async function api(path, init) {
  const res = await fetch(`/tray-manager${path}`, {
    headers: { "content-type": "application/json" },
    ...init
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}
function TrayManagerView(props) {
  const { t } = props;
  const [status, setStatus] = (0, import_react.useState)(null);
  const [shortcut, setShortcut] = (0, import_react.useState)(null);
  const [shortcutMsg, setShortcutMsg] = (0, import_react.useState)(null);
  const [shortcutBusy, setShortcutBusy] = (0, import_react.useState)(false);
  const [visible, setVisible] = (0, import_react.useState)(null);
  const [notifyStart, setNotifyStart] = (0, import_react.useState)(null);
  const [notifyStop, setNotifyStop] = (0, import_react.useState)(null);
  const [settingsMsg, setSettingsMsg] = (0, import_react.useState)(null);
  const [autoStart, setAutoStart] = (0, import_react.useState)(null);
  const [autoStartMsg, setAutoStartMsg] = (0, import_react.useState)(null);
  const [wer, setWer] = (0, import_react.useState)(null);
  const [werMsg, setWerMsg] = (0, import_react.useState)(null);
  const [logMsg, setLogMsg] = (0, import_react.useState)(null);
  const [log, setLog] = (0, import_react.useState)([]);
  const [busy, setBusy] = (0, import_react.useState)(false);
  const [error, setError] = (0, import_react.useState)(null);
  const refresh = async () => {
    try {
      const s = await api("/api/status");
      setStatus(s);
      setError(null);
      const sc = await api("/api/shortcut/status");
      setShortcut(sc);
      const st = await api("/api/settings");
      setVisible(st.visible);
      setNotifyStart(st.notifyStart);
      setNotifyStop(st.notifyStop);
      const as = await api("/api/autostart");
      setAutoStart(as.enabled);
      const wr = await api("/api/wer");
      setWer(wr.enabled);
      const l = await api("/api/log?lines=100");
      setLog(l.lines);
    } catch (err) {
      setError(String(err?.message ?? err));
    }
  };
  (0, import_react.useEffect)(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 1e4);
    return () => clearInterval(timer);
  }, []);
  const run = async (action) => {
    setBusy(true);
    setError(null);
    try {
      const r = await api(`/api/tray/${action}`, { method: "POST" });
      if (!r.ok) setError(t("op.error", { message: String(action) }));
    } catch (err) {
      setError(String(err?.message ?? err));
    } finally {
      setBusy(false);
      void refresh();
    }
  };
  const createShortcut = async (force) => {
    setShortcutBusy(true);
    setShortcutMsg(null);
    try {
      const r = await api(`/api/shortcut/create${force ? "?force=1" : ""}`, { method: "POST" });
      if (!r.ok || !r.path) {
        setShortcutMsg(t("shortcut.failed", { message: r.error ?? "unknown" }));
      } else if (force || r.created) {
        setShortcutMsg(r.created ? t("shortcut.created", { path: r.path }) : t("shortcut.recreated", { path: r.path }));
      } else {
        setShortcutMsg(t("shortcut.exists", { path: r.path }));
      }
    } catch (err) {
      setShortcutMsg(t("shortcut.failed", { message: String(err?.message ?? err) }));
    } finally {
      setShortcutBusy(false);
      void refresh();
    }
  };
  const toggleVisible = async (next) => {
    setSettingsMsg(null);
    try {
      const r = await api("/api/settings", { method: "POST", body: JSON.stringify({ visible: next }) });
      if (!r.ok) {
        setSettingsMsg(t("settings.failed", { message: "server" }));
        return;
      }
      setVisible(next);
      setSettingsMsg(t("settings.saved"));
    } catch (err) {
      setSettingsMsg(t("settings.failed", { message: String(err?.message ?? err) }));
    }
  };
  const toggleNotify = async (key, next) => {
    setSettingsMsg(null);
    try {
      const r = await api("/api/settings", { method: "POST", body: JSON.stringify({ [key]: next }) });
      if (!r.ok) {
        setSettingsMsg(t("settings.failed", { message: "server" }));
        return;
      }
      if (key === "notifyStart") setNotifyStart(next);
      else setNotifyStop(next);
      setSettingsMsg(t("settings.saved"));
    } catch (err) {
      setSettingsMsg(t("settings.failed", { message: String(err?.message ?? err) }));
    }
  };
  const toggleAutoStart = async (next) => {
    setAutoStartMsg(null);
    try {
      const r = await api("/api/autostart", { method: "POST", body: JSON.stringify({ enabled: next }) });
      if (!r.ok) {
        setAutoStartMsg(t("autostart.failed", { message: "server" }));
        return;
      }
      setAutoStart(next);
      setAutoStartMsg(t("autostart.saved"));
    } catch (err) {
      setAutoStartMsg(t("autostart.failed", { message: String(err?.message ?? err) }));
    }
  };
  const toggleWer = async (next) => {
    setWerMsg(null);
    try {
      const r = await api("/api/wer", { method: "POST", body: JSON.stringify({ enabled: next }) });
      if (!r.ok) {
        setWerMsg(t("settings.failed", { message: "server" }));
        return;
      }
      setWer(r.enabled);
      setWerMsg(r.enabled === next ? t("settings.saved") : t("settings.failed", { message: "write" }));
    } catch (err) {
      setWerMsg(t("settings.failed", { message: String(err?.message ?? err) }));
    }
  };
  const openLog = async () => {
    setLogMsg(null);
    try {
      await api("/api/log/open");
      setLogMsg(t("log.opened"));
    } catch (err) {
      setLogMsg(t("log.openfailed", { message: String(err?.message ?? err) }));
    }
  };
  const box = { border: "1px solid var(--dsh-border, #444)", borderRadius: 8, padding: 12, marginBottom: 12, maxWidth: 720 };
  const row = { display: "flex", gap: 8, alignItems: "center", margin: "4px 0", flexWrap: "wrap" };
  const btn = { padding: "6px 14px", borderRadius: 6, border: "1px solid #888", cursor: "pointer" };
  const pre = { background: "rgba(0,0,0,0.35)", padding: 10, borderRadius: 6, fontSize: 12, maxHeight: 320, overflow: "auto", whiteSpace: "pre-wrap", margin: 0 };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { padding: 16 }, children: [
    error !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { color: "#ff6b6b", marginBottom: 8 }, children: error }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: box, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontWeight: 600, marginBottom: 6 }, children: t("shortcut.title") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: row, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
        shortcut?.exists === true ? "\u25CF" : "\u25CB",
        " ",
        shortcut?.path ?? t("shortcut.missing")
      ] }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { color: "#999", fontSize: 12, margin: "4px 0 8px" }, children: t("shortcut.hint") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: row, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: btn, disabled: shortcutBusy, onClick: () => void createShortcut(false), children: t("shortcut.create") }) }),
      shortcutMsg !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { color: "#999", fontSize: 12, marginTop: 6 }, children: shortcutMsg })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: box, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontWeight: 600, marginBottom: 6 }, children: t("settings.title") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { style: { ...row, cursor: "pointer" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            type: "checkbox",
            checked: visible === true,
            disabled: visible === null,
            onChange: (e) => void toggleVisible(e.target.checked)
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: t("settings.visible") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { color: "#999", fontSize: 12, marginTop: 4 }, children: t("settings.visible.hint") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { style: { ...row, cursor: "pointer", marginTop: 10 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            type: "checkbox",
            checked: notifyStart === true,
            disabled: notifyStart === null,
            onChange: (e) => void toggleNotify("notifyStart", e.target.checked)
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: t("settings.notifyStart") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { color: "#999", fontSize: 12, marginTop: 4 }, children: t("settings.notifyStart.hint") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { style: { ...row, cursor: "pointer", marginTop: 10 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            type: "checkbox",
            checked: notifyStop === true,
            disabled: notifyStop === null,
            onChange: (e) => void toggleNotify("notifyStop", e.target.checked)
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: t("settings.notifyStop") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { color: "#999", fontSize: 12, marginTop: 4 }, children: t("settings.notifyStop.hint") }),
      settingsMsg !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { color: "#999", fontSize: 12, marginTop: 6 }, children: settingsMsg }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { style: { ...row, cursor: "pointer", marginTop: 10 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            type: "checkbox",
            checked: autoStart === true,
            disabled: autoStart === null,
            onChange: (e) => void toggleAutoStart(e.target.checked)
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: t("autostart.enable") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { color: "#999", fontSize: 12, marginTop: 4 }, children: t("autostart.hint") }),
      autoStartMsg !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { color: "#999", fontSize: 12, marginTop: 6 }, children: autoStartMsg }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { style: { ...row, cursor: "pointer", marginTop: 10 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            type: "checkbox",
            checked: wer === true,
            disabled: wer === null,
            onChange: (e) => void toggleWer(e.target.checked)
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: t("wer.enable") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { color: "#999", fontSize: 12, marginTop: 4 }, children: t("wer.hint") }),
      werMsg !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { color: "#999", fontSize: 12, marginTop: 6 }, children: werMsg })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: box, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontWeight: 600, marginBottom: 6 }, children: t("status.title") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: row, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: status?.tray.running ? "\u25CF " + t("status.running") : "\u25CB " + t("status.stopped") }),
        status?.tray.running && status.tray.pid != null && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { color: "#999" }, children: [
          t("status.pid"),
          ": ",
          status.tray.pid
        ] }),
        status?.tray.running && status.tray.startedAt != null && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { color: "#999" }, children: [
          t("status.started"),
          ": ",
          status.tray.startedAt
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: row, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: btn, disabled: busy || status?.tray.running === true, onClick: () => void run("start"), children: t("btn.start") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: btn, disabled: busy || status?.tray.running !== true, onClick: () => void run("stop"), children: t("btn.stop") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: btn, disabled: busy, onClick: () => void refresh(), children: t("btn.refresh") })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: box, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontWeight: 600, marginBottom: 6 }, children: t("script.title") }),
      status?.script.exists === true ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: row, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { color: "#999" }, children: [
          t("script.path"),
          ":"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: status.script.path })
      ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { color: "#ffa94d" }, children: t("script.missing") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontWeight: 600, margin: "10px 0 6px" }, children: t("server.title") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: row, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: typeof window !== "undefined" ? window.location.origin : "" }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { color: "#999", fontSize: 12 }, children: t("server.hint") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: box, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { fontWeight: 600, marginBottom: 6, display: "flex", alignItems: "center", gap: 10 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: t("log.title") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: btn, onClick: () => void openLog(), children: t("log.open") })
      ] }),
      logMsg !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { color: "#999", fontSize: 12, marginBottom: 6 }, children: logMsg }),
      log.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("pre", { style: pre, children: log.join("\n") }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { color: "#999" }, children: t("log.empty") })
    ] })
  ] });
}

// src/client/index.ts
var NS = "tray-manager";
var zh = {
  "tab.label": "\u6258\u76D8\u7BA1\u7406",
  "shortcut.title": "\u684C\u9762\u5FEB\u6377\u65B9\u5F0F",
  "shortcut.hint": "\u5B89\u88C5\u63D2\u4EF6\u65F6\u81EA\u52A8\u751F\u6210\uFF1B\u82E5\u88AB\u8BEF\u5220\uFF0C\u70B9\u51FB\u4E0B\u65B9\u6309\u94AE\u91CD\u65B0\u751F\u6210",
  "shortcut.create": "\u751F\u6210\u5FEB\u6377\u65B9\u5F0F",
  "shortcut.created": "\u5DF2\u751F\u6210\uFF1A{path}",
  "shortcut.exists": "\u5DF2\u5B58\u5728\uFF1A{path}",
  "shortcut.recreated": "\u5DF2\u91CD\u5EFA\uFF1A{path}",
  "shortcut.failed": "\u751F\u6210\u5931\u8D25\uFF1A{message}",
  "shortcut.missing": "\u5FEB\u6377\u65B9\u5F0F\u5F53\u524D\u4E0D\u5B58\u5728",
  "settings.title": "\u6258\u76D8\u56FE\u6807",
  "settings.visible": "\u663E\u793A\u6258\u76D8\u56FE\u6807",
  "settings.visible.hint": "\u5173\u95ED\u540E\u6258\u76D8\u8FDB\u7A0B\u7167\u5E38\u8FD0\u884C\uFF0C\u4F46\u56FE\u6807\u9690\u85CF\uFF08\u670D\u52A1\u4E0D\u53D7\u5F71\u54CD\uFF09\uFF1B\u91CD\u65B0\u5F00\u542F\u5373\u53EF\u6062\u590D\u663E\u793A\u3002\u82E5\u56FE\u6807\u88AB\u7CFB\u7EDF\u6298\u53E0\u5230\u300C^\u300D\u6EA2\u51FA\u533A\uFF0C\u53EF\u624B\u52A8\u62D6\u56DE\u56FA\u5B9A\u3002",
  "settings.notifyStart": "\u542F\u52A8/\u91CD\u542F\u5B8C\u6210\u5F39\u7A97",
  "settings.notifyStart.hint": "\u670D\u52A1\u542F\u52A8\u6216\u91CD\u542F\u5B8C\u6210\uFF08\u542B\u5931\u8D25\uFF09\u65F6\u663E\u793A\u6C14\u6CE1\u901A\u77E5\uFF1B\u5173\u95ED\u540E\u5168\u90E8\u9759\u9ED8\uFF0C\u4EC5\u5199\u5165\u65E5\u5FD7\u3002",
  "settings.notifyStop": "\u505C\u6B62\u5B8C\u6210\u5F39\u7A97",
  "settings.notifyStop.hint": "\u505C\u6B62\u670D\u52A1\u65F6\u663E\u793A\u6C14\u6CE1\u901A\u77E5\uFF1B\u5173\u95ED\u540E\u9759\u9ED8\u505C\u6B62\uFF0C\u4EC5\u5199\u5165\u65E5\u5FD7\u3002",
  "settings.saved": "\u5DF2\u4FDD\u5B58",
  "settings.failed": "\u4FDD\u5B58\u5931\u8D25\uFF1A{message}",
  "autostart.enable": "\u5F00\u673A\u81EA\u542F\uFF08\u4EC5\u542F\u52A8\u6258\u76D8\uFF0C\u4E0D\u6253\u5F00\u7F51\u9875\uFF09",
  "autostart.hint": "\u5F00\u673A\u65F6\u540E\u53F0\u542F\u52A8\u6258\u76D8\u4E0E\u670D\u52A1\uFF1B\u7F51\u9875\u53EA\u5728\u53CC\u51FB\u6258\u76D8\u56FE\u6807\u65F6\u6253\u5F00\u3002",
  "autostart.saved": "\u5DF2\u4FDD\u5B58",
  "autostart.failed": "\u8BBE\u7F6E\u5931\u8D25\uFF1A{message}",
  "status.title": "\u6258\u76D8\u72B6\u6001",
  "status.running": "\u8FD0\u884C\u4E2D",
  "status.stopped": "\u672A\u8FD0\u884C",
  "status.pid": "\u8FDB\u7A0B ID",
  "status.started": "\u542F\u52A8\u65F6\u95F4",
  "script.title": "\u6258\u76D8\u811A\u672C",
  "script.path": "\u811A\u672C\u8DEF\u5F84",
  "script.missing": "\u672A\u627E\u5230\u6258\u76D8\u811A\u672C\uFF08trayScript \u672A\u914D\u7F6E\u6216\u8DEF\u5F84\u65E0\u6548\uFF09",
  "server.title": "\u670D\u52A1\u5730\u5740",
  "server.hint": "\u5F53\u524D\u9875\u9762\u5730\u5740\u5373 Harness \u670D\u52A1\u5730\u5740",
  "btn.start": "\u542F\u52A8\u6258\u76D8",
  "btn.stop": "\u505C\u6B62\u6258\u76D8",
  "btn.refresh": "\u5237\u65B0",
  "wer.enable": "\u6291\u5236\u7CFB\u7EDF\u9519\u8BEF\u5F39\u7A97\uFF08node \u542F\u52A8\u5931\u8D25\u4E0D\u518D\u5F39\u7A97\uFF09",
  "wer.hint": "\u5199\u5165\u6CE8\u518C\u8868 HKCU\\...\\Windows Error Reporting\\Disabled\\node.exe=1\uFF0C\u53EF\u968F\u65F6\u5173\u95ED\u6062\u590D\u3002\u9002\u7528\u4E8E 0xc0000142 \u7C7B\u542F\u52A8\u5931\u8D25\u5F39\u7A97\u3002",
  "log.open": "\u6253\u5F00\u65E5\u5FD7\u6587\u4EF6",
  "log.opened": "\u5DF2\u5728\u8D44\u6E90\u7BA1\u7406\u5668\u4E2D\u6253\u5F00",
  "log.openfailed": "\u6253\u5F00\u5931\u8D25\uFF1A{message}",
  "log.title": "\u8FD0\u884C\u65E5\u5FD7\uFF08dsh-tray.log\uFF09",
  "log.empty": "\u6682\u65E0\u65E5\u5FD7",
  "op.error": "\u64CD\u4F5C\u5931\u8D25\uFF1A{message}",
  "load.error": "\u52A0\u8F7D\u5931\u8D25\uFF1A{message}"
};
var en = {
  "tab.label": "Tray Manager",
  "shortcut.title": "Desktop shortcut",
  "shortcut.hint": "Created automatically on install; click below to recreate if deleted",
  "shortcut.create": "Create shortcut",
  "shortcut.created": "Created: {path}",
  "shortcut.exists": "Already exists: {path}",
  "shortcut.recreated": "Recreated: {path}",
  "shortcut.failed": "Failed: {message}",
  "shortcut.missing": "Shortcut does not exist",
  "settings.title": "Tray icon",
  "settings.visible": "Show tray icon",
  "settings.visible.hint": 'When off, the tray process keeps running but the icon is hidden (service unaffected); turn it back on to restore. If the system folds the icon into the "chevron" overflow area, drag it back to pin it.',
  "settings.notifyStart": "Startup/restart balloon",
  "settings.notifyStart.hint": "Show a balloon when the service starts or restarts (including failures); when off, all startup notifications are silent and only logged.",
  "settings.notifyStop": "Stop balloon",
  "settings.notifyStop.hint": "Show a balloon when the service stops; when off, stopping is silent and only logged.",
  "settings.saved": "Saved",
  "settings.failed": "Save failed: {message}",
  "autostart.enable": "Start tray on boot (no web page)",
  "autostart.hint": "Starts the tray and service in the background at logon; the web page opens only when you double-click the tray icon.",
  "autostart.saved": "Saved",
  "autostart.failed": "Failed: {message}",
  "wer.enable": "Suppress system error dialogs (no popup on node startup failure)",
  "wer.hint": "Writes HKCU\\...\\Windows Error Reporting\\Disabled\\node.exe=1; reversible. For 0xc0000142-style startup failure dialogs.",
  "log.open": "Open log file",
  "log.opened": "Opened in Explorer",
  "log.openfailed": "Failed: {message}",
  "status.title": "Tray status",
  "status.running": "Running",
  "status.stopped": "Not running",
  "status.pid": "PID",
  "status.started": "Started at",
  "script.title": "Tray script",
  "script.path": "Script path",
  "script.missing": "Tray script not found (trayScript unset or invalid)",
  "server.title": "Service URL",
  "server.hint": "The current page URL is the Harness service URL",
  "btn.start": "Start tray",
  "btn.stop": "Stop tray",
  "btn.refresh": "Refresh",
  "log.title": "Log tail (dsh-tray.log)",
  "log.empty": "No log yet",
  "op.error": "Operation failed: {message}",
  "load.error": "Load failed: {message}"
};
var dshMobile = {};
var inject = ["slots", "locale"];
function apply(ctx) {
  const t = ctx.locale.bind(NS);
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "tray-manager: dictionaries");
  ctx.slots.inject("settings.plugins.tab", () => ctx.slots.register({
    name: "settings.plugins.tab",
    id: "tray-manager",
    order: 30,
    label: () => t("tab.label"),
    locale: NS
  }, (props) => TrayManagerView({ ...props, t })));
}
return module.exports; } });
