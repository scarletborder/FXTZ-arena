param(
  [string]$CharactersRoot = "apps/frontend/public/assets/characters",
  [string]$GuideOutput = "apps/frontend/public/assets/characters/combat-Horizon-hitCircles.png",
  [int]$FrameSize = 512,
  [double]$GameCoreRadius = 4.5,
  [int]$GameDisplaySize = 104
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root = Resolve-Path -LiteralPath $CharactersRoot
$sourceFiles = Get-ChildItem -LiteralPath $root -Recurse -Filter "combat.png"

foreach ($sourceFile in $sourceFiles) {
  $source = [System.Drawing.Bitmap]::FromFile($sourceFile.FullName)
  try {
    if ($source.Width -ne $FrameSize * 3 -or $source.Height -ne $FrameSize * 2) {
      throw "Expected $($FrameSize * 3)x$($FrameSize * 2), got $($source.Width)x$($source.Height): $($sourceFile.FullName)"
    }

    $target = New-Object System.Drawing.Bitmap ($FrameSize * 6), $FrameSize, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
      $graphics = [System.Drawing.Graphics]::FromImage($target)
      try {
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighSpeed
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
        $graphics.Clear([System.Drawing.Color]::Transparent)

        for ($row = 0; $row -lt 2; $row += 1) {
          for ($column = 0; $column -lt 3; $column += 1) {
            $frameIndex = $row * 3 + $column
            $sourceRect = New-Object System.Drawing.Rectangle -ArgumentList @(
              ($column * $FrameSize),
              ($row * $FrameSize),
              $FrameSize,
              $FrameSize
            )
            $targetRect = New-Object System.Drawing.Rectangle -ArgumentList @(
              ($frameIndex * $FrameSize),
              0,
              $FrameSize,
              $FrameSize
            )
            $graphics.DrawImage($source, $targetRect, $sourceRect, [System.Drawing.GraphicsUnit]::Pixel)
          }
        }
      } finally {
        $graphics.Dispose()
      }

      $targetPath = Join-Path $sourceFile.DirectoryName "combat-Horizon.png"
      $target.Save($targetPath, [System.Drawing.Imaging.ImageFormat]::Png)
      Write-Host "Wrote $targetPath ($($target.Width)x$($target.Height))"
    } finally {
      $target.Dispose()
    }
  } finally {
    $source.Dispose()
  }
}

$guidePath = if ([System.IO.Path]::IsPathRooted($GuideOutput)) {
  $GuideOutput
} else {
  Join-Path (Get-Location) $GuideOutput
}
$guideDirectory = Split-Path -Parent $guidePath
if (!(Test-Path -LiteralPath $guideDirectory)) {
  New-Item -ItemType Directory -Path $guideDirectory | Out-Null
}

$guide = New-Object System.Drawing.Bitmap ($FrameSize * 6), $FrameSize, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
try {
  $graphics = [System.Drawing.Graphics]::FromImage($guide)
  try {
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.Clear([System.Drawing.Color]::Transparent)

    $sourceCoreRadius = $GameCoreRadius * $FrameSize / $GameDisplaySize
    $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(230, 255, 66, 66)), 2
    $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(60, 255, 66, 66))
    try {
      for ($frameIndex = 0; $frameIndex -lt 6; $frameIndex += 1) {
        $centerX = $frameIndex * $FrameSize + [int]($FrameSize / 2)
        $centerY = [int]($FrameSize / 2)
        $diameter = $sourceCoreRadius * 2
        $graphics.FillEllipse($brush, [single]($centerX - $sourceCoreRadius), [single]($centerY - $sourceCoreRadius), [single]$diameter, [single]$diameter)
        $graphics.DrawEllipse($pen, [single]($centerX - $sourceCoreRadius), [single]($centerY - $sourceCoreRadius), [single]$diameter, [single]$diameter)
        $graphics.DrawLine($pen, $centerX - 12, $centerY, $centerX + 12, $centerY)
        $graphics.DrawLine($pen, $centerX, $centerY - 12, $centerX, $centerY + 12)
      }
    } finally {
      $brush.Dispose()
      $pen.Dispose()
    }
  } finally {
    $graphics.Dispose()
  }

  $guide.Save($guidePath, [System.Drawing.Imaging.ImageFormat]::Png)
  Write-Host "Wrote $guidePath ($($guide.Width)x$($guide.Height))"
} finally {
  $guide.Dispose()
}
