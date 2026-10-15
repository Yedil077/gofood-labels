' Скрытый запуск Print Agent с автоперезапуском: если агент упал или потерял сеть
' и завершился — через 10 секунд он запускается снова. Второй экземпляр агент
' не запустит сам (замок out\agent.lock), так что двойной старт безопасен.
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = dir
If Not fso.FolderExists(dir & "\out") Then fso.CreateFolder(dir & "\out")
Do
  sh.Run "cmd /c node src\index.js >> out\agent-console.log 2>&1", 0, True
  WScript.Sleep 10000
Loop
