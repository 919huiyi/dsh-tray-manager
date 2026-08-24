' ============================================================
'  DeepSeek Harness one-click launcher (double-click, no console)
'  Starts the dsh web service hidden in the background, opens
'  the web UI in your default browser, and keeps a tray icon in
'  the notification area (bottom-right).
'  Right-click the tray icon -> "Exit" to really stop the service.
'  Closing the browser window does NOT stop the background service.
'  Tray implementation: prefers the lightweight C# version
'  (DeepSeek Harness Tray.exe) when present, else the PowerShell
'  version (DeepSeek Harness Tray.ps1).
' ============================================================
Option Explicit

Dim fso, shell, dir, exe, ps1
Set fso   = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

dir = fso.GetParentFolderName(WScript.ScriptFullName)
exe = dir & "\DeepSeek Harness Tray.exe"
ps1 = dir & "\DeepSeek Harness Tray.ps1"

If fso.FileExists(exe) Then
    ' C# lightweight tray: double-click -> tray + service + open web page
    shell.Run """" & exe & """", 0, False
ElseIf fso.FileExists(ps1) Then
    ' PowerShell tray (legacy implementation)
    shell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & ps1 & """", 0, False
Else
    MsgBox "Missing tray program:" & vbCrLf & exe & vbCrLf & ps1, vbCritical, "DeepSeek Harness"
    WScript.Quit 1
End If
