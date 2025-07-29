# Check if @types/node is installed
Write-Host "Checking if @types/node is installed..."
try {
    npm list @types/node -g
    Write-Host "@types/node is already installed."
} catch {
    Write-Host "@types/node is not installed. Installing..."
    npm install @types/node -g
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to install @types/node. Please install it manually."
        exit 1
    }
    Write-Host "@types/node successfully installed."
}

# Install youtube-dl-exec locally
Write-Host "Checking if youtube-dl-exec is installed locally..."
try {
    npm list youtube-dl-exec
    Write-Host "youtube-dl-exec is already installed locally."
} catch {
    Write-Host "youtube-dl-exec is not installed locally. Installing..."
    npm install youtube-dl-exec
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to install youtube-dl-exec locally. Please install it manually."
        exit 1
    }
    Write-Host "youtube-dl-exec successfully installed locally."
}

# Define variables
$videoUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
$maxRetries = 3
$retryDelaySeconds = 5

# Function to download the audio
function Download-Audio {
    param (
        [string]$url,
        [int]$retryCount
    )

    Write-Host "Attempting to download audio from: $url (Attempt $($retryCount + 1) / $maxRetries)"

    try {
        Write-Host "Executing: node c:\\scripts\\tunefetcherai\\youtube_download_scripts\\download_test.cjs"
        node c:\scripts\tunefetcherai\youtube_download_scripts\download_test.cjs
        $exitCode = $LASTEXITCODE
        Write-Host "Execution completed with exit code: $exitCode"
        if ($exitCode -ne 0) {
            throw "Failed to execute download_test.js with exit code: $exitCode"
        }
        Write-Host "download_test.js execution completed successfully."
        return $true # Indicate success
    } catch {
        Write-Warning "Error during download: $($_.Exception.Message)"
        Write-Host "Error details: $($_.Exception | Format-List | Out-String)"
        if ($retryCount -lt $maxRetries) {
            Write-Host "Retrying in $retryDelaySeconds seconds..."
            Start-Sleep -Seconds $retryDelaySeconds
            Download-Audio -url $url -retryCount ($retryCount + 1) # Recursive call
        }
        else {
            Write-Error "Max retries reached. Download failed."
            return $false # Indicate failure
        }
    }
}

# Start the download process
Write-Host "Starting the download process..."
$downloadResult = Download-Audio -url $videoUrl -retryCount 0

if ($downloadResult) {
    Write-Host "Download completed successfully."
    exit 0
} else {
    Write-Host "Download failed after multiple retries."
    exit 1
}