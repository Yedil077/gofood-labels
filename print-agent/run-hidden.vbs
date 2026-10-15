' Hidden start of GOFOOD Print Agent with auto-restart:
' if the agent crashes or exits, it is started again after 10 seconds.
' Exit code 3 = another agent is already running on this PC -> stop this loop.
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = dir
If Not fso.FolderExists(dir & "\out") Then fso.CreateFolder(dir & "\out")
Do
  rc = sh.Run("cmd /c node src\index.js >> out\agent-console.log 2>&1", 0, True)
  If rc = 3 Then WScript.Quit
  WScript.Sleep 10000
Loop
