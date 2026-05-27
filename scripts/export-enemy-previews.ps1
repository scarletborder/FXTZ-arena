param(
  [string]$AssetsRoot = "apps/frontend/public/assets/enemy",
  [string]$OutputRoot = "apps/frontend/public/assets/temp_enemy",
  [int]$PreviewCellSize = 72
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$assetsPath = (Resolve-Path -LiteralPath $AssetsRoot).Path
$configPath = Join-Path $assetsPath "enemy_config.json"
if (!(Test-Path -LiteralPath $configPath)) {
  throw "Enemy configuration not found: $configPath"
}

if (!(Test-Path -LiteralPath $OutputRoot)) {
  New-Item -ItemType Directory -Path $OutputRoot -Force | Out-Null
}
$outputPath = (Resolve-Path -LiteralPath $OutputRoot).Path
if ($outputPath -eq $assetsPath) {
  throw "OutputRoot must not be the source assets folder."
}

function Export-AllEnemyPreviews {
  $config = Get-Content -Raw -LiteralPath $configPath | ConvertFrom-Json
  $entries = [System.Collections.Generic.List[object]]::new()
  $stripEntries = [System.Collections.Generic.List[object]]::new()
  $sourceImages = @{}

  try {
    foreach ($enemy in $config.enemy_config) {
      $sourceName = [string]$enemy.source
      $source = Get-SourceImage $sourceImages $assetsPath $sourceName

      foreach ($anim in $enemy.anim) {
        $frameFiles = [System.Collections.Generic.List[string]]::new()
        for ($frameIndex = 0; $frameIndex -lt $anim.anim_frames.Count; $frameIndex += 1) {
          $frame = $anim.anim_frames[$frameIndex]
          $x = [int]$frame.frame[0]
          $y = [int]$frame.frame[1]
          $width = [int]$frame.frame[2]
          $height = [int]$frame.frame[3]
          Assert-CropBounds $source $sourceName $enemy.id $x $y $width $height

          $filename = "{0}_{1}_frame-{2:D2}.png" -f $enemy.id, $anim.name, $frameIndex
          Export-Crop $source (Join-Path $outputPath $filename) $x $y $width $height
          $frameFiles.Add($filename)

          $entries.Add([PSCustomObject]@{
            id = [string]$enemy.id
            source = $sourceName
            animation = [string]$anim.name
            animationType = [string]$anim.anim_type
            frame = $frameIndex
            frameCount = $anim.anim_frames.Count
            durationSeconds = [float]$frame.duration
            scale = @($enemy.scale[0], $enemy.scale[1])
            hitBox = @($enemy.hit_box[0], $enemy.hit_box[1])
            crop = @($x, $y, $width, $height)
            file = $filename
          })
        }

        $stripFile = "{0}_{1}_strip.png" -f $enemy.id, $anim.name
        Export-Strip $frameFiles $outputPath $stripFile
        $stripEntries.Add([PSCustomObject]@{
          id = [string]$enemy.id
          animation = [string]$anim.name
          animationType = [string]$anim.anim_type
          file = $stripFile
        })
      }
    }

    $manifest = [PSCustomObject]@{
      generatedFrom = "assets/enemy/enemy_config.json"
      usage = "enemy entries export every configured animation frame plus one horizontal strip per animation"
      exportedFrameCount = $entries.Count
      exportedStripCount = $stripEntries.Count
      entries = $entries
      strips = $stripEntries
    }
    $manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $outputPath "manifest.json") -Encoding UTF8

    Export-ContactSheet $stripEntries $entries $outputPath $PreviewCellSize
    Write-Host "Exported $($entries.Count) frames and $($stripEntries.Count) animation strips to $outputPath"
    Write-Host "Review: $(Join-Path $outputPath 'contact-sheet.png')"
  } finally {
    foreach ($image in $sourceImages.Values) {
      $image.Dispose()
    }
  }
}

function Get-SourceImage($cache, [string]$root, [string]$sourceName) {
  if (!$cache.ContainsKey($sourceName)) {
    $path = Join-Path $root "$sourceName.png"
    if (!(Test-Path -LiteralPath $path)) {
      throw "Source texture not found: $path"
    }
    $cache[$sourceName] = [System.Drawing.Bitmap]::FromFile($path)
  }
  return $cache[$sourceName]
}

function Assert-CropBounds(
  [System.Drawing.Bitmap]$source,
  [string]$sourceName,
  [string]$id,
  [int]$x,
  [int]$y,
  [int]$width,
  [int]$height
) {
  if ($x -lt 0 -or $y -lt 0 -or $width -le 0 -or $height -le 0 -or
    $x + $width -gt $source.Width -or $y + $height -gt $source.Height) {
    throw "Crop for $id is outside $sourceName.png: [$x, $y, $width, $height] in $($source.Width)x$($source.Height)"
  }
}

function Export-Crop(
  [System.Drawing.Bitmap]$source,
  [string]$targetPath,
  [int]$x,
  [int]$y,
  [int]$width,
  [int]$height
) {
  $target = New-Object System.Drawing.Bitmap $width, $height, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  try {
    $graphics = [System.Drawing.Graphics]::FromImage($target)
    try {
      $graphics.Clear([System.Drawing.Color]::Transparent)
      $graphics.DrawImage(
        $source,
        (New-Object System.Drawing.Rectangle 0, 0, $width, $height),
        (New-Object System.Drawing.Rectangle $x, $y, $width, $height),
        [System.Drawing.GraphicsUnit]::Pixel
      )
    } finally {
      $graphics.Dispose()
    }
    $target.Save($targetPath, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $target.Dispose()
  }
}

function Export-Strip($frameFiles, [string]$root, [string]$targetFile) {
  if ($frameFiles.Count -eq 0) {
    return
  }
  $first = [System.Drawing.Bitmap]::FromFile((Join-Path $root $frameFiles[0]))
  try {
    $strip = New-Object System.Drawing.Bitmap ($first.Width * $frameFiles.Count), $first.Height, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
      $graphics = [System.Drawing.Graphics]::FromImage($strip)
      try {
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
        for ($i = 0; $i -lt $frameFiles.Count; $i += 1) {
          $frameImage = [System.Drawing.Bitmap]::FromFile((Join-Path $root $frameFiles[$i]))
          try {
            $graphics.DrawImage($frameImage, $first.Width * $i, 0, $first.Width, $first.Height)
          } finally {
            $frameImage.Dispose()
          }
        }
      } finally {
        $graphics.Dispose()
      }
      $strip.Save((Join-Path $root $targetFile), [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
      $strip.Dispose()
    }
  } finally {
    $first.Dispose()
  }
}

function Export-ContactSheet($strips, $entries, [string]$root, [int]$cellSize) {
  $rows = @($strips)
  $leftMargin = 196
  $topMargin = 52
  $rowHeight = $cellSize + 24
  $width = $leftMargin + 360
  $height = $topMargin + $rows.Count * $rowHeight + 36
  $sheet = New-Object System.Drawing.Bitmap $width, $height, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  try {
    $graphics = [System.Drawing.Graphics]::FromImage($sheet)
    $titleFont = New-Object System.Drawing.Font "Segoe UI", 16, ([System.Drawing.FontStyle]::Bold)
    $labelFont = New-Object System.Drawing.Font "Consolas", 10
    $smallFont = New-Object System.Drawing.Font "Consolas", 8
    $white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(238, 242, 247))
    $muted = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(171, 184, 199))
    $panel = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(30, 36, 49))
    try {
      $graphics.Clear([System.Drawing.Color]::FromArgb(15, 19, 27))
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
      $graphics.DrawString("Enemy config animations", $titleFont, $white, 16, 14)

      for ($rowIndex = 0; $rowIndex -lt $rows.Count; $rowIndex += 1) {
        $row = $rows[$rowIndex]
        $y = $topMargin + $rowIndex * $rowHeight
        $first = @($entries | Where-Object { $_.id -eq $row.id -and $_.animation -eq $row.animation })[0]
        $graphics.FillRectangle($panel, 8, $y - 4, $width - 16, $rowHeight - 6)
        $graphics.DrawString("$($row.id) $($row.animation)", $labelFont, $white, 16, $y + 14)
        $graphics.DrawString("$($row.animationType) hit $($first.hitBox[0])x$($first.hitBox[1]) scale $($first.scale[0])x$($first.scale[1])", $smallFont, $muted, 16, $y + 36)

        $image = [System.Drawing.Bitmap]::FromFile((Join-Path $root $row.file))
        try {
          $maxW = 328
          $maxH = $cellSize - 12
          $scale = [Math]::Min($maxW / $image.Width, $maxH / $image.Height)
          $drawWidth = [int]($image.Width * $scale)
          $drawHeight = [int]($image.Height * $scale)
          $graphics.DrawImage($image, $leftMargin, $y + [int](($cellSize - $drawHeight) / 2), $drawWidth, $drawHeight)
        } finally {
          $image.Dispose()
        }
      }
    } finally {
      $white.Dispose()
      $muted.Dispose()
      $panel.Dispose()
      $titleFont.Dispose()
      $labelFont.Dispose()
      $smallFont.Dispose()
      $graphics.Dispose()
    }
    $sheet.Save((Join-Path $root "contact-sheet.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $sheet.Dispose()
  }
}

Export-AllEnemyPreviews
