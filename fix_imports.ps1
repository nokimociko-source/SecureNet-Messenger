Get-ChildItem -Path core,api -Recurse -Filter *.go | ForEach-Object {
    $content = Get-Content $_.FullName
    $newContent = $content -replace 'securenet-backend/internal', 'securenet-backend/core'
    if ($content -ne $newContent) {
        Set-Content -Path $_.FullName -Value $newContent
        Write-Host "Updated: $($_.FullName)"
    }
}
