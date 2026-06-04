param(
  [string]$OutputPath = (Join-Path $PSScriptRoot "shoot_range.png")
)

Add-Type -AssemblyName System.Drawing

$width = 1600
$height = 960
$bitmap = New-Object System.Drawing.Bitmap $width, $height
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

function New-Color([int]$a, [int]$r, [int]$g, [int]$b) {
  return [System.Drawing.Color]::FromArgb($a, $r, $g, $b)
}

function Draw-Line([float]$x1, [float]$y1, [float]$x2, [float]$y2, [System.Drawing.Color]$color, [float]$lineWidth = 1) {
  $pen = New-Object System.Drawing.Pen $color, $lineWidth
  $graphics.DrawLine($pen, $x1, $y1, $x2, $y2)
  $pen.Dispose()
}

try {
  $background = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.Rectangle 0, 0, $width, $height),
    (New-Color 255 7 19 27),
    (New-Color 255 11 25 34),
    [System.Drawing.Drawing2D.LinearGradientMode]::Vertical
  )
  $graphics.FillRectangle($background, 0, 0, $width, $height)
  $background.Dispose()

  $major = New-Color 72 64 86 100
  $minor = New-Color 42 47 66 78

  for ($x = 0; $x -le $width; $x += 60) {
    $color = if (($x % 240) -eq 0) { $major } else { $minor }
    Draw-Line $x 0 $x $height $color 1
  }

  for ($y = 0; $y -le $height; $y += 60) {
    $color = if (($y % 240) -eq 0) { $major } else { $minor }
    Draw-Line 0 $y $width $y $color 1
  }

  for ($x = -$height; $x -le $width; $x += 120) {
    Draw-Line $x $height ($x + $height) 0 (New-Color 24 70 88 98) 1
  }

  $edge = New-Color 90 51 82 103
  Draw-Line 0 0 $width 0 $edge 2
  Draw-Line 0 ($height - 1) $width ($height - 1) $edge 2
  Draw-Line 0 0 0 $height $edge 2
  Draw-Line ($width - 1) 0 ($width - 1) $height $edge 2

  $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
  Write-Host "Wrote $OutputPath"
}
finally {
  $graphics.Dispose()
  $bitmap.Dispose()
}
