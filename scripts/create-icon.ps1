$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$destination = Join-Path $workspace 'media\caled.ico'
Add-Type -AssemblyName System.Drawing

# Rasterize the same simple geometry as media/caled-brand.svg at each native
# Windows icon size. This is a reproducible vector export, not a generated image.
$images = New-Object 'Collections.Generic.List[byte[]]'
$sizes = @(16, 24, 32, 48, 64, 128, 256)
foreach ($size in $sizes) {
    $bitmap = New-Object Drawing.Bitmap($size, $size, [Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.ScaleTransform(($size / 256.0), ($size / 256.0))
    $background = New-Object Drawing.SolidBrush([Drawing.ColorTranslator]::FromHtml('#203d31'))
    $rounded = New-Object Drawing.Drawing2D.GraphicsPath
    $rounded.AddArc(8, 8, 120, 120, 180, 90)
    $rounded.AddArc(128, 8, 120, 120, 270, 90)
    $rounded.AddArc(128, 128, 120, 120, 0, 90)
    $rounded.AddArc(8, 128, 120, 120, 90, 90)
    $rounded.CloseFigure()
    $graphics.FillPath($background, $rounded)
    $letter = New-Object Drawing.Pen([Drawing.ColorTranslator]::FromHtml('#f5f4ee'), 17)
    $letter.StartCap = [Drawing.Drawing2D.LineCap]::Round
    $letter.EndCap = [Drawing.Drawing2D.LineCap]::Round
    $graphics.DrawArc($letter, 65, 63, 130, 130, 46, 268)
    $arrow = New-Object Drawing.Pen([Drawing.ColorTranslator]::FromHtml('#a5d5b6'), 17)
    $arrow.StartCap = [Drawing.Drawing2D.LineCap]::Round
    $arrow.EndCap = [Drawing.Drawing2D.LineCap]::Round
    $arrow.LineJoin = [Drawing.Drawing2D.LineJoin]::Round
    $graphics.DrawLine($arrow, 125, 128, 199, 128)
    $points = [Drawing.PointF[]]@((New-Object Drawing.PointF(175, 104)), (New-Object Drawing.PointF(199, 128)), (New-Object Drawing.PointF(175, 152)))
    $graphics.DrawLines($arrow, $points)
    $stream = New-Object IO.MemoryStream
    $bitmap.Save($stream, [Drawing.Imaging.ImageFormat]::Png)
    $images.Add($stream.ToArray())
    $stream.Dispose()
    $arrow.Dispose()
    $letter.Dispose()
    $rounded.Dispose()
    $background.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
}
$file = [IO.File]::Create($destination)
$writer = New-Object IO.BinaryWriter($file)
try {
    $writer.Write([uint16]0)
    $writer.Write([uint16]1)
    $writer.Write([uint16]$sizes.Count)
    $offset = 6 + (16 * $sizes.Count)
    for ($i = 0; $i -lt $sizes.Count; $i++) {
        $dimension = if ($sizes[$i] -eq 256) { 0 } else { $sizes[$i] }
        $writer.Write([byte]$dimension)
        $writer.Write([byte]$dimension)
        $writer.Write([byte]0)
        $writer.Write([byte]0)
        $writer.Write([uint16]1)
        $writer.Write([uint16]32)
        $writer.Write([uint32]$images[$i].Length)
        $writer.Write([uint32]$offset)
        $offset += $images[$i].Length
    }
    foreach ($image in $images) { $writer.Write($image) }
} finally { $writer.Dispose(); $file.Dispose() }
Write-Output ('Caled icon created: ' + $destination)
