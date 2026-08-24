$ErrorActionPreference = 'Stop'

$ProjectPath = Split-Path -Parent $PSScriptRoot
$WorkbookPath = 'C:\Users\ADMIN\OneDrive - luamorena.com.br\PRONTA ENTREGA AFIO.xlsm'
$PythonPath = 'C:\Users\ADMIN\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
$GitPath = 'C:\Users\ADMIN\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\cmd\git.exe'
$env:GH_CONFIG_DIR = Join-Path $ProjectPath '.gh-config'
$env:GIT_EXEC_PATH = 'C:\Users\ADMIN\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\mingw64\bin'
$GitOptions = @(
    '-c', "safe.directory=$ProjectPath",
    '-c', 'http.sslBackend=openssl',
    '-c', 'credential.helper=!gh auth git-credential'
)

if (-not (Test-Path -LiteralPath $WorkbookPath -PathType Leaf)) {
    throw "Planilha de estoque nao encontrada: $WorkbookPath"
}
if (-not (Test-Path -LiteralPath $PythonPath -PathType Leaf)) {
    throw "Leitor de planilhas nao encontrado: $PythonPath"
}
if (-not (Test-Path -LiteralPath $GitPath -PathType Leaf)) {
    throw "Publicador Git nao encontrado: $GitPath"
}

$env:LOCAL_STOCK_FILE = $WorkbookPath
& $PythonPath (Join-Path $PSScriptRoot 'sync_sharepoint_stock.py')
if ($LASTEXITCODE -ne 0) { throw 'Falha ao ler a planilha de estoque.' }

$TrackedFiles = @(
    'stock-data.js',
    'stock-meta.json',
    'dist/client/stock-data.js',
    'dist/client/stock-meta.json'
)

& $GitPath @GitOptions -C $ProjectPath diff --quiet -- $TrackedFiles
if ($LASTEXITCODE -eq 0) {
    Write-Output 'Estoque conferido; nenhuma alteracao de quantidade.'
    exit 0
}

& $GitPath @GitOptions -C $ProjectPath add -- $TrackedFiles
if ($LASTEXITCODE -ne 0) { throw 'Falha ao preparar os arquivos do estoque.' }

& $GitPath @GitOptions -C $ProjectPath `
    -c user.name='ORLA Estoque Automático' `
    -c user.email='estoque-automatico@users.noreply.github.com' `
    commit -m 'Atualiza estoque automatico da pronta entrega' -- $TrackedFiles
if ($LASTEXITCODE -ne 0) { throw 'Falha ao registrar a atualizacao do estoque.' }

& $PythonPath (Join-Path $PSScriptRoot 'publicar-commit-github.py')
if ($LASTEXITCODE -ne 0) { throw 'Falha ao publicar o estoque no GitHub.' }

Write-Output 'SUCESSO: estoque atualizado e publicado para a loja ORLA.'
