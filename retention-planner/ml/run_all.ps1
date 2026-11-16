# retention-planner 전체 실행: 환경 확인 → 데이터 생성(A·B) → 학습·평가 → (민감도) → 테스트 → site/data 복사
# 단계마다 시각과 결과를 ml\run_log.txt에 한 줄씩 남긴다.
# 진행 보기: Get-Content "ml\run_log.txt" -Wait -Tail 20
#
# 사용 예:
#   .\run_all.ps1                 # 기본(시드 42, 9,000명)
#   .\run_all.ps1 -Sensitivity    # 민감도 분석(P1)까지
#   .\run_all.ps1 -Seed 7 -N 3000 # 빠른 시험용

param(
    [int]$Seed = 42,
    [int]$N = 9000,
    [switch]$Sensitivity
)

$ErrorActionPreference = 'Continue'
$here = $PSScriptRoot
$root = Split-Path $here -Parent
$py = Join-Path $here '.venv\Scripts\python.exe'
$log = Join-Path $here 'run_log.txt'
$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'

function Write-Log([string]$msg) {
    $line = '{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
    Write-Host $line
    Add-Content -Path $log -Value $line -Encoding UTF8
}

# 파이썬 스크립트를 실행하고 출력도 로그에 남긴다. 실패하면 전체를 멈춘다.
# 스크립트 파일이 아직 없으면(구현 전) 건너뛰고 기록한다.
function Invoke-Step([string]$name, [string]$script, [string[]]$arguments) {
    $path = Join-Path $here $script
    if (-not $script.StartsWith('-') -and -not (Test-Path $path)) {
        Write-Log "[건너뜀] $name - $script 없음(구현 전)"
        return
    }
    Write-Log "[시작] $name"
    $sw = [Diagnostics.Stopwatch]::StartNew()
    Push-Location $here
    # 표준 오류 줄은 PowerShell 5.1에서 ErrorRecord로 감싸지므로 본문만 꺼내고 빈 줄은 버린다
    & $py $script @arguments 2>&1 | ForEach-Object {
        $text = if ($_ -is [System.Management.Automation.ErrorRecord]) { $_.Exception.Message } else { "$_" }
        if ($text -and $text -ne 'System.Management.Automation.RemoteException') { Write-Log "    $text" }
    }
    $code = $LASTEXITCODE
    Pop-Location
    $sec = [math]::Round($sw.Elapsed.TotalSeconds, 1)
    if ($code -ne 0) {
        Write-Log "[실패] $name (종료 코드 $code, ${sec}초)"
        Write-Log '===== 실행 중단 ====='
        exit 1
    }
    Write-Log "[완료] $name (${sec}초)"
}

Write-Log "===== 실행 시작 (시드 $Seed, 인원 $N, 민감도 $($Sensitivity.IsPresent)) ====="

# 1. 환경 확인
if (-not (Test-Path $py)) {
    Write-Log "[실패] 가상환경 없음: $py"
    Write-Log '    준비: uv venv -p 3.15 .venv ; uv pip install -p .venv -r requirements.txt'
    exit 1
}
# PowerShell 5.1은 외부 프로그램 인자의 큰따옴표를 지우므로 작은따옴표만 쓴다
$check = 'import sys,numpy,pandas,sklearn;print(''python'',sys.version.split()[0],''numpy'',numpy.__version__,''pandas'',pandas.__version__,''sklearn'',sklearn.__version__)'
$ver = & $py -c $check 2>&1
if ($LASTEXITCODE -ne 0) { Write-Log "[실패] 환경 확인: $ver"; exit 1 }
Write-Log "[완료] 환경 확인 - $ver"

# 2. 데이터 생성 (시나리오 A·B)
foreach ($sc in 'A', 'B') {
    Invoke-Step "데이터 생성 시나리오 $sc" 'generate_data.py' @('--scenario', $sc, '--seed', "$Seed", '--n', "$N")
}

# 3. 학습·평가
Invoke-Step '학습·평가' 'train_eval.py' @('--seed', "$Seed")

# 4. 민감도 분석 (P1, 선택)
if ($Sensitivity) {
    Invoke-Step '민감도 분석' 'sensitivity.py' @('--seed', "$Seed", '--n', "$N")
}

# 5. 테스트
if (Test-Path (Join-Path $here 'tests')) {
    Invoke-Step '테스트' '-m' @('unittest', 'discover', '-s', 'tests', '-v')
} else {
    Write-Log '[건너뜀] 테스트 - tests 폴더 없음(구현 전)'
}

# 6. 결과 복사 → site/data
$results = Join-Path $root 'results'
$site = Join-Path $root 'site'
if ((Test-Path $results) -and (Test-Path $site)) {
    $dest = Join-Path $site 'data'
    if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
    Copy-Item -Recurse $results $dest
    Write-Log "[완료] 결과 복사 → site\data"
    # 웹 계산(alloc.js)이 Python 기대값(reference.json)과 같은지 대조
    $jsTest = Join-Path $site 'alloc.test.mjs'
    if ((Test-Path $jsTest) -and (Get-Command node -ErrorAction SilentlyContinue)) {
        Write-Log '[시작] 웹 계산 대조 (node alloc.test.mjs)'
        $out = & node $jsTest $dest 2>&1 | ForEach-Object { "$_" }
        $code = $LASTEXITCODE
        $out | Select-Object -Last 3 | ForEach-Object { Write-Log "    $_" }
        if ($code -ne 0) { Write-Log "[실패] 웹 계산 대조 (종료 코드 $code)"; exit 1 }
        Write-Log '[완료] 웹 계산 대조'
    }
} else {
    Write-Log '[건너뜀] 결과 복사 - results 또는 site 폴더 없음(구현 전)'
}

# 7. 보고서 표 갱신 (docs/REPORT.md의 표시 구간)
Invoke-Step '보고서 표 갱신' 'make_report_tables.py' @()

Write-Log '===== 실행 끝 ====='
