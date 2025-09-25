Add-Type -AssemblyName System.Drawing
$walkerPath = "C:\Users\Caleb\Documents\ZombieSurvival\assets\enemies\zombie.png"
$flamedPath = "C:\Users\Caleb\Documents\ZombieSurvival\assets\enemies\flamed_walker.png"
$ia = [System.Drawing.Image]::FromFile($walkerPath)
$ib = [System.Drawing.Image]::FromFile($flamedPath)
"walker: $($ia.Width)x$($ia.Height)"
"flamed: $($ib.Width)x$($ib.Height)"
$ia.Dispose()
$ib.Dispose()