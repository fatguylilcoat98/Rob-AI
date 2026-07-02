# Windows Deployment Script for Enhanced Memory System
Write-Host "🚀 SPLENDOR ENHANCED MEMORY SYSTEM - WINDOWS DEPLOYMENT" -ForegroundColor Green
Write-Host "=" * 60

# Check if database file exists
if (Test-Path "database/complete-fresh-deploy.sql") {
    Write-Host "✅ Found database schema file" -ForegroundColor Green
} else {
    Write-Host "❌ Database schema file not found!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "📋 DEPLOYMENT OPTIONS:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1️⃣  SUPABASE DASHBOARD (RECOMMENDED)" -ForegroundColor Cyan
Write-Host "   • Go to your Supabase project dashboard"
Write-Host "   • Navigate to SQL Editor"
Write-Host "   • Copy the SQL below and paste it there"
Write-Host ""
Write-Host "2️⃣  COMMAND LINE (if you have psql)" -ForegroundColor Cyan
Write-Host "   psql `$env:SUPABASE_URL -f database/complete-fresh-deploy.sql"
Write-Host ""

# Ask user which option they want
$choice = Read-Host "Choose option (1 for Dashboard, 2 for Command Line, Enter to show SQL)"

if ($choice -eq "2") {
    # Try command line deployment
    if ($env:SUPABASE_URL) {
        Write-Host "🔧 Attempting command line deployment..." -ForegroundColor Yellow
        try {
            psql $env:SUPABASE_URL -f "database/complete-fresh-deploy.sql"
            Write-Host "✅ Database deployed successfully!" -ForegroundColor Green
        } catch {
            Write-Host "❌ Command line deployment failed. Try Dashboard option." -ForegroundColor Red
            $choice = "1"
        }
    } else {
        Write-Host "❌ SUPABASE_URL environment variable not set!" -ForegroundColor Red
        Write-Host "Set it with: `$env:SUPABASE_URL='your-connection-string'" -ForegroundColor Yellow
        $choice = "1"
    }
}

if ($choice -eq "1" -or $choice -eq "") {
    Write-Host ""
    Write-Host "📄 COPY THIS SQL TO SUPABASE DASHBOARD:" -ForegroundColor Green
    Write-Host "=" * 60 -ForegroundColor Gray
    Write-Host ""

    # Display the SQL content
    Get-Content "database/complete-fresh-deploy.sql" | Write-Host

    Write-Host ""
    Write-Host "=" * 60 -ForegroundColor Gray
    Write-Host "📋 Copy the SQL above and paste it into Supabase SQL Editor" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "🧪 AFTER DEPLOYMENT, RUN TESTS:" -ForegroundColor Green
Write-Host "npm run memory:test"
Write-Host ""
Write-Host "🎯 THEN START THE ENHANCED SERVER:" -ForegroundColor Green
Write-Host "npm run server:enhanced"
Write-Host ""
Write-Host "✨ Deployment script complete!" -ForegroundColor Green