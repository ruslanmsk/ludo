// Game version
const GAME_VERSION = '1.2.0';
console.log(`🎲 Лудо v${GAME_VERSION}`);

// Game state
let playerCount = 4;
let currentPlayer = 0;
let diceValue = 0;
let diceRolled = false;
let manualMode = false;
let players = [];
let canRollAgain = false;
let skipDelay = 1; // секунды задержки перед автопропуском
let skipTimer = null;
let countdownInterval = null;
let isAnimating = false; // блокировка во время анимации
let consecutiveSixes = 0; // счётчик шестёрок подряд
let autoMoveOnSingleOption = false; // автоход при единственном варианте
let autoRoll = false; // автобросок кубика

// Player configurations
const PLAYER_COLORS = ['red', 'blue', 'green', 'yellow'];
const PLAYER_NAMES = {
    'red': 'Красный',
    'blue': 'Синий',
    'green': 'Зелёный',
    'yellow': 'Жёлтый'
};

// Board path positions (clockwise from red start)
// Main path: 52 cells, each player starts at different position
const MAIN_PATH_LENGTH = 52;

// Starting positions on main path for each color
// Yellow: top-left base, starts at position 0 [6,1]
// Blue: top-right base, starts at position 13 [1,8]
// Green: bottom-right base, starts at position 26 [8,13]
// Red: bottom-left base, starts at position 39 [13,6]
const START_POSITIONS = {
    'yellow': 0,
    'blue': 13,
    'green': 26,
    'red': 39
};

// Home entry positions (before entering home column)
const HOME_ENTRY = {
    'yellow': 50,
    'blue': 11,
    'green': 24,
    'red': 37
};

// Safe spots on main path (only start positions are safe)
const SAFE_SPOTS = [0, 13, 26, 39];

// Board cell coordinates (row, col) for main path - clockwise
const MAIN_PATH_COORDS = [
    // Yellow start area exit and path (0-12)
    [6, 1], [6, 2], [6, 3], [6, 4], [6, 5], // 0-4
    [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6], // 5-10
    [0, 7], [0, 8], // 11-12

    // Blue start area exit and path (13-25)
    [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], // 13-17
    [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14], // 18-23
    [7, 14], [8, 14], // 24-25

    // Green start area exit and path (26-38)
    [8, 13], [8, 12], [8, 11], [8, 10], [8, 9], // 26-30
    [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8], // 31-36
    [14, 7], [14, 6], // 37-38

    // Red start area exit and path (39-51)
    [13, 6], [12, 6], [11, 6], [10, 6], [9, 6], // 39-43
    [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0], // 44-49
    [7, 0], [6, 0] // 50-51
];

// Home path coordinates for each color (6 cells each, last is center)
const HOME_PATHS = {
    'yellow': [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6]],
    'blue': [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7]],
    'green': [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9], [7, 8]],
    'red': [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7], [8, 7]]
};

// Base positions for each color's 4 tokens
const BASE_POSITIONS = {
    'yellow': [[1, 1], [1, 4], [4, 1], [4, 4]],
    'blue': [[1, 10], [1, 13], [4, 10], [4, 13]],
    'red': [[10, 1], [10, 4], [13, 1], [13, 4]],
    'green': [[10, 10], [10, 13], [13, 10], [13, 13]]
};

// Token class
class Token {
    constructor(color, index) {
        this.color = color;
        this.index = index;
        this.inBase = true;
        this.position = -1; // -1 = in base, 0-51 = main path, 52-57 = home path
        this.finished = false;
    }

    getAbsolutePosition() {
        if (this.inBase) return -1;
        if (this.finished) return 100;

        const startPos = START_POSITIONS[this.color];
        return (startPos + this.position) % MAIN_PATH_LENGTH;
    }

    canMove(steps) {
        if (this.finished) return false;

        if (this.inBase) {
            return steps === 6;
        }

        const startPos = START_POSITIONS[this.color];
        const homeEntry = HOME_ENTRY[this.color];

        // Calculate current absolute position
        let currentAbsPos = (startPos + this.position) % MAIN_PATH_LENGTH;

        // Check if entering or in home path
        let stepsToHome = 0;
        if (this.position < MAIN_PATH_LENGTH) {
            // Calculate steps to reach home entry
            let posFromStart = this.position;
            let homeEntryFromStart = (homeEntry - startPos + MAIN_PATH_LENGTH) % MAIN_PATH_LENGTH;

            if (posFromStart <= homeEntryFromStart) {
                stepsToHome = homeEntryFromStart - posFromStart;
            } else {
                // Already passed home entry
                stepsToHome = MAIN_PATH_LENGTH - posFromStart + homeEntryFromStart;
            }

            if (steps > stepsToHome) {
                // Will enter home path
                let homeSteps = steps - stepsToHome - 1;
                return homeSteps <= 5; // 6 home cells (0-5)
            }
        } else {
            // Already in home path
            let homePos = this.position - MAIN_PATH_LENGTH;
            let newHomePos = homePos + steps;
            return newHomePos <= 5; // Exact or under
        }

        return true;
    }

    move(steps) {
        if (this.inBase) {
            this.inBase = false;
            this.position = 0;
            return;
        }

        const startPos = START_POSITIONS[this.color];
        const homeEntry = HOME_ENTRY[this.color];

        if (this.position < MAIN_PATH_LENGTH) {
            let homeEntryFromStart = (homeEntry - startPos + MAIN_PATH_LENGTH) % MAIN_PATH_LENGTH;
            let stepsToHome = homeEntryFromStart - this.position;

            if (stepsToHome < 0) {
                stepsToHome += MAIN_PATH_LENGTH;
            }

            if (this.position <= homeEntryFromStart && this.position + steps > homeEntryFromStart) {
                // Enter home path
                let homeSteps = steps - stepsToHome - 1;
                this.position = MAIN_PATH_LENGTH + homeSteps;

                if (homeSteps === 5) {
                    this.finished = true;
                }
            } else {
                this.position = (this.position + steps) % MAIN_PATH_LENGTH;
            }
        } else {
            // In home path
            let homePos = this.position - MAIN_PATH_LENGTH;
            homePos += steps;
            this.position = MAIN_PATH_LENGTH + homePos;

            if (homePos === 5) {
                this.finished = true;
            }
        }
    }

    getCoords() {
        if (this.inBase) {
            return BASE_POSITIONS[this.color][this.index];
        }

        if (this.position < MAIN_PATH_LENGTH) {
            const startPos = START_POSITIONS[this.color];
            const absPos = (startPos + this.position) % MAIN_PATH_LENGTH;
            return MAIN_PATH_COORDS[absPos];
        } else {
            const homePos = this.position - MAIN_PATH_LENGTH;
            if (homePos >= 0 && homePos < 6) {
                return HOME_PATHS[this.color][homePos];
            }
            return HOME_PATHS[this.color][5]; // Center
        }
    }
}

// Player class
class Player {
    constructor(color) {
        this.color = color;
        this.tokens = [];
        for (let i = 0; i < 4; i++) {
            this.tokens.push(new Token(color, i));
        }
    }

    hasWon() {
        return this.tokens.every(t => t.finished);
    }

    hasMovableToken(diceValue) {
        return this.tokens.some(t => t.canMove(diceValue));
    }

    getMovableTokens(diceValue) {
        return this.tokens.filter(t => t.canMove(diceValue));
    }
}

// Initialize game
function startGame(count) {
    playerCount = count;
    players = [];

    // Set up players based on count
    let activeColors;
    if (count === 2) {
        activeColors = ['red', 'blue'];
    } else if (count === 3) {
        activeColors = ['red', 'blue', 'green'];
    } else {
        activeColors = ['red', 'blue', 'green', 'yellow'];
    }

    for (const color of activeColors) {
        players.push(new Player(color));
    }

    currentPlayer = 0;
    diceValue = 0;
    diceRolled = false;
    canRollAgain = false;
    consecutiveSixes = 0;

    // Clear any existing timers
    if (skipTimer) clearTimeout(skipTimer);
    if (countdownInterval) clearInterval(countdownInterval);

    document.getElementById('setup-screen').style.display = 'none';
    document.getElementById('game-container').style.display = 'flex';
    document.getElementById('winner-modal').style.display = 'none';

    createBoard();
    updateUI();
    scheduleAutoRoll();
}

function showSetup() {
    // Clear any existing timers
    if (skipTimer) clearTimeout(skipTimer);
    if (countdownInterval) clearInterval(countdownInterval);

    // Reset background to default
    document.body.classList.remove('theme-red', 'theme-blue', 'theme-green', 'theme-yellow');

    document.getElementById('setup-screen').style.display = 'block';
    document.getElementById('game-container').style.display = 'none';
    document.getElementById('winner-modal').style.display = 'none';
}

function createBoard() {
    const board = document.getElementById('board');
    board.innerHTML = '';

    for (let row = 0; row < 15; row++) {
        for (let col = 0; col < 15; col++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.dataset.row = row;
            cell.dataset.col = col;

            // Base areas
            if (row < 6 && col < 6) {
                cell.classList.add('base-yellow');
                // Token holders
                if ((row === 1 || row === 4) && (col === 1 || col === 4)) {
                    cell.innerHTML = '<div class="token-holder"></div>';
                }
            } else if (row < 6 && col > 8) {
                cell.classList.add('base-blue');
                if ((row === 1 || row === 4) && (col === 10 || col === 13)) {
                    cell.innerHTML = '<div class="token-holder"></div>';
                }
            } else if (row > 8 && col < 6) {
                cell.classList.add('base-red');
                if ((row === 10 || row === 13) && (col === 1 || col === 4)) {
                    cell.innerHTML = '<div class="token-holder"></div>';
                }
            } else if (row > 8 && col > 8) {
                cell.classList.add('base-green');
                if ((row === 10 || row === 13) && (col === 10 || col === 13)) {
                    cell.innerHTML = '<div class="token-holder"></div>';
                }
            }

            // Center area (triangles will be done with CSS/SVG)
            if (row >= 6 && row <= 8 && col >= 6 && col <= 8) {
                cell.classList.add('center');
                // Create colored center
                if (row === 6 && col === 7) cell.style.background = '#5cc8d8'; // blue
                if (row === 7 && col === 6) cell.style.background = '#f7d44c'; // yellow
                if (row === 7 && col === 8) cell.style.background = '#78c880'; // green
                if (row === 8 && col === 7) cell.style.background = '#e87878'; // red
                if (row === 7 && col === 7) cell.style.background = 'white';
            }

            // Home paths (colored columns leading to center)
            if (row === 7 && col >= 1 && col <= 5) cell.classList.add('home-yellow');  // Yellow: left horizontal
            if (row === 7 && col >= 9 && col <= 13) cell.classList.add('home-green');  // Green: right horizontal
            if (col === 7 && row >= 1 && row <= 5) cell.classList.add('home-blue');    // Blue: top vertical
            if (col === 7 && row >= 9 && row <= 13) cell.classList.add('home-red');    // Red: bottom vertical

            // Start spots (where tokens exit from base) - only these have stars
            if (row === 6 && col === 1) cell.classList.add('start-yellow', 'safe-spot');
            if (row === 1 && col === 8) cell.classList.add('start-blue', 'safe-spot');
            if (row === 8 && col === 13) cell.classList.add('start-green', 'safe-spot');
            if (row === 13 && col === 6) cell.classList.add('start-red', 'safe-spot');

            board.appendChild(cell);
        }
    }

    renderTokens();
}

function renderTokens() {
    // Clear existing tokens
    document.querySelectorAll('.token').forEach(t => t.remove());

    // Group tokens by position AND color
    const positionMap = new Map();

    for (const player of players) {
        for (const token of player.tokens) {
            if (token.finished) continue;

            const coords = token.getCoords();
            // Key includes color to group same-color tokens separately
            const key = `${coords[0]}-${coords[1]}-${token.color}`;

            if (!positionMap.has(key)) {
                positionMap.set(key, []);
            }
            positionMap.get(key).push(token);
        }
    }

    // Count how many different colors are on each cell for positioning
    const cellColorCount = new Map();
    for (const key of positionMap.keys()) {
        const [row, col] = key.split('-');
        const cellKey = `${row}-${col}`;
        cellColorCount.set(cellKey, (cellColorCount.get(cellKey) || 0) + 1);
    }

    // Track which color index we're on for each cell
    const cellColorIndex = new Map();

    // Render tokens
    for (const [key, tokens] of positionMap) {
        const [row, col, color] = key.split('-');
        const cell = document.querySelector(`.cell[data-row="${row}"][data-col="${col}"]`);

        if (!cell) continue;

        // Get container (token-holder if exists, otherwise cell)
        let container = cell.querySelector('.token-holder') || cell;

        // Calculate offset if multiple colors on same cell
        const cellKey = `${row}-${col}`;
        const totalColors = cellColorCount.get(cellKey) || 1;
        const colorIdx = cellColorIndex.get(cellKey) || 0;
        cellColorIndex.set(cellKey, colorIdx + 1);

        // Create token element
        const tokenEl = document.createElement('div');
        tokenEl.className = `token token-${tokens[0].color}`;
        tokenEl.dataset.color = tokens[0].color;
        tokenEl.dataset.index = tokens[0].index;

        // Offset tokens if multiple colors on same cell
        if (totalColors > 1) {
            const offsetX = colorIdx === 0 ? -25 : 25;
            const offsetY = colorIdx === 0 ? -15 : 15;
            tokenEl.style.transform = `translate(${offsetX}%, ${offsetY}%) scale(0.7)`;
            tokenEl.style.zIndex = 10 + colorIdx;
        }

        // Add 3D base
        const baseEl = document.createElement('div');
        baseEl.className = 'token-base';
        tokenEl.appendChild(baseEl);

        // Add eyes
        const leftEye = document.createElement('div');
        leftEye.className = 'token-eye left';
        tokenEl.appendChild(leftEye);

        const rightEye = document.createElement('div');
        rightEye.className = 'token-eye right';
        tokenEl.appendChild(rightEye);

        // If multiple tokens of same color
        if (tokens.length > 1) {
            const countEl = document.createElement('div');
            countEl.className = 'token-count';
            countEl.textContent = tokens.length;
            tokenEl.appendChild(countEl);
        }

        tokenEl.onclick = () => handleTokenClick(tokens[0]);
        container.appendChild(tokenEl);
    }

    highlightMovableTokens();
}

function highlightMovableTokens() {
    document.querySelectorAll('.token').forEach(t => t.classList.remove('movable'));

    if (!diceRolled || diceValue === 0) return;

    const player = players[currentPlayer];
    const movableTokens = player.getMovableTokens(diceValue);

    for (const token of movableTokens) {
        const coords = token.getCoords();
        const cell = document.querySelector(`.cell[data-row="${coords[0]}"][data-col="${coords[1]}"]`);
        if (cell) {
            const tokenEl = cell.querySelector(`.token-${token.color}`);
            if (tokenEl) {
                tokenEl.classList.add('movable');
            }
        }
    }
}

function handleTokenClick(token) {
    console.log('[TOKEN] Клик на фишку:', token.color, token.index, '| diceRolled:', diceRolled, '| diceValue:', diceValue, '| isAnimating:', isAnimating);

    if (!diceRolled || diceValue === 0) {
        console.log('[TOKEN] Заблокировано: кубик не брошен');
        return;
    }
    if (isAnimating) {
        console.log('[TOKEN] Заблокировано: анимация');
        return;
    }

    // Clear any auto-skip timers
    if (skipTimer) clearTimeout(skipTimer);
    if (countdownInterval) clearInterval(countdownInterval);

    const player = players[currentPlayer];
    if (token.color !== player.color) {
        console.log('[TOKEN] Заблокировано: не ваша фишка');
        return;
    }
    if (!token.canMove(diceValue)) {
        console.log('[TOKEN] Заблокировано: фишка не может двигаться');
        return;
    }

    // Start animated movement
    console.log('[TOKEN] Начинаем движение фишки на', diceValue, 'шагов');
    isAnimating = true;
    const steps = diceValue;
    const wasInBase = token.inBase;

    animateTokenMove(token, steps, wasInBase, () => {
        // Animation complete - check for capture
        let captured = false;

        if (!token.inBase && token.position < MAIN_PATH_LENGTH && !token.finished) {
            const absPos = token.getAbsolutePosition();
            const isSafe = SAFE_SPOTS.includes(absPos);

            if (!isSafe) {
                for (const otherPlayer of players) {
                    if (otherPlayer.color === player.color) continue;

                    for (const otherToken of otherPlayer.tokens) {
                        if (otherToken.inBase || otherToken.finished) continue;
                        if (otherToken.position >= MAIN_PATH_LENGTH) continue;

                        const otherAbsPos = otherToken.getAbsolutePosition();
                        if (otherAbsPos === absPos) {
                            // Capture!
                            otherToken.inBase = true;
                            otherToken.position = -1;
                            captured = true;
                            console.log('[GAME] Захват! Фишка', otherPlayer.color, 'отправлена на базу');
                            setMessage(`${PLAYER_NAMES[player.color]} съел фишку ${PLAYER_NAMES[otherPlayer.color]}! Бросайте ещё раз`);
                        }
                    }
                }
            }
        }

        // Check for win
        if (player.hasWon()) {
            isAnimating = false;
            showWinner(player);
            return;
        }

        // Next turn logic
        diceRolled = false;

        // Bonus roll for capture (but not if it was a 6, that already gives bonus)
        if (captured && diceValue !== 6) {
            canRollAgain = true;
            consecutiveSixes = 0; // Reset sixes counter on capture
            console.log('[GAME] Захват! Бонусный бросок');
            // Message already set above
        } else if (diceValue === 6) {
            // consecutiveSixes уже увеличен при броске
            canRollAgain = true;
            console.log('[GAME] Шестёрка! consecutiveSixes:', consecutiveSixes, '| canRollAgain:', true);
            if (captured) {
                setMessage(`Съели фишку и выбросили 6! (${consecutiveSixes}/3) Бросайте ещё раз`);
            } else {
                setMessage(`Вы выбросили 6! (${consecutiveSixes}/3) Бросайте ещё раз`);
            }
        } else {
            canRollAgain = false;
            consecutiveSixes = 0;
            console.log('[GAME] Обычный ход. Передаём ход следующему игроку');
            nextPlayer();
        }

        diceValue = 0;
        isAnimating = false;
        console.log('[GAME] Ход завершён. isAnimating:', false, '| canRollAgain:', canRollAgain);
        renderTokens();
        updateUI();
        
        // Автобросок если можно бросить ещё раз
        if (canRollAgain) {
            scheduleAutoRoll();
        }
    });
}

// Build the path of positions for animation
function buildPath(token, totalSteps, wasInBase) {
    const path = [];
    const color = token.color;
    const startPos = START_POSITIONS[color];
    const homeEntry = HOME_ENTRY[color];
    const homeEntryFromStart = (homeEntry - startPos + MAIN_PATH_LENGTH) % MAIN_PATH_LENGTH;

    // Starting point
    if (wasInBase) {
        path.push(BASE_POSITIONS[color][token.index]);
        // Exit to start position (position 0 for this color)
        path.push(getCoordsForPos(color, 0));
        return path;
    }

    // Start from current position
    path.push(token.getCoords());

    let pos = token.position;
    let inHome = pos >= MAIN_PATH_LENGTH;

    for (let i = 0; i < totalSteps; i++) {
        if (inHome) {
            // Already in home path - just move forward
            pos++;
        } else {
            // On main path
            // Check if next step enters home
            if (pos === homeEntryFromStart) {
                // Enter home path
                pos = MAIN_PATH_LENGTH;
                inHome = true;
            } else {
                pos++;
                // Handle wrap-around on main path
                if (pos >= MAIN_PATH_LENGTH) {
                    pos = 0;
                }
            }
        }
        path.push(getCoordsForPos(color, pos));
    }

    return path;
}

function getCoordsForPos(color, position) {
    if (position < MAIN_PATH_LENGTH) {
        const startPos = START_POSITIONS[color];
        const absPos = (startPos + position) % MAIN_PATH_LENGTH;
        return MAIN_PATH_COORDS[absPos];
    } else {
        const homePos = position - MAIN_PATH_LENGTH;
        if (homePos >= 0 && homePos < 6) {
            return HOME_PATHS[color][homePos];
        }
        return HOME_PATHS[color][5];
    }
}

// Animate token movement step by step
function animateTokenMove(token, totalSteps, wasInBase, onComplete) {
    const board = document.getElementById('board');

    // Build the path before modifying token
    const path = buildPath(token, totalSteps, wasInBase);

    // Now update token state using original move logic
    token.move(totalSteps);

    // Get cell dimensions from first cell
    const firstCell = document.querySelector('.cell[data-row="0"][data-col="0"]');
    const cellRect = firstCell.getBoundingClientRect();
    const cellWidth = cellRect.width;
    const cellHeight = cellRect.height;

    // Get starting cell position
    const startCoords = path[0];
    const startCell = document.querySelector(`.cell[data-row="${startCoords[0]}"][data-col="${startCoords[1]}"]`);
    const startCellRect = startCell.getBoundingClientRect();

    // Create animated token element
    const animToken = document.createElement('div');
    animToken.className = `token token-${token.color}`;
    animToken.style.position = 'fixed';
    animToken.style.width = (cellWidth * 0.7) + 'px';
    animToken.style.height = (cellHeight * 0.7) + 'px';
    animToken.style.left = (startCellRect.left + cellWidth * 0.15) + 'px';
    animToken.style.top = (startCellRect.top + cellHeight * 0.15) + 'px';
    animToken.style.zIndex = '1000';
    animToken.style.transition = 'left 0.15s ease-out, top 0.15s ease-out';
    animToken.style.pointerEvents = 'none';

    // Add base for 3D effect
    const baseEl = document.createElement('div');
    baseEl.className = 'token-base';
    animToken.appendChild(baseEl);

    // Add eyes
    const leftEye = document.createElement('div');
    leftEye.className = 'token-eye left';
    animToken.appendChild(leftEye);
    const rightEye = document.createElement('div');
    rightEye.className = 'token-eye right';
    animToken.appendChild(rightEye);

    document.body.appendChild(animToken);

    // Hide original token during animation
    const origToken = startCell.querySelector(`.token-${token.color}`);
    if (origToken) origToken.style.visibility = 'hidden';

    let currentStep = 0;

    function moveToNextStep() {
        currentStep++;

        if (currentStep >= path.length) {
            // Animation complete
            animToken.remove();
            onComplete();
            return;
        }

        const coords = path[currentStep];
        const targetCell = document.querySelector(`.cell[data-row="${coords[0]}"][data-col="${coords[1]}"]`);

        if (targetCell) {
            const targetRect = targetCell.getBoundingClientRect();
            animToken.style.left = (targetRect.left + cellWidth * 0.15) + 'px';
            animToken.style.top = (targetRect.top + cellHeight * 0.15) + 'px';
        }

        setTimeout(moveToNextStep, 180);
    }

    // Start animation after a small delay
    setTimeout(moveToNextStep, 50);
}

function rollDice() {
    console.log('[DICE] rollDice вызван. diceRolled:', diceRolled, 'canRollAgain:', canRollAgain, 'isAnimating:', isAnimating);

    if (diceRolled && !canRollAgain) {
        console.log('[DICE] Заблокировано: уже бросали и нельзя бросать снова');
        return;
    }
    if (isAnimating) {
        console.log('[DICE] Заблокировано: анимация в процессе');
        return;
    }

    const diceDisplay = document.getElementById('dice-display');

    diceDisplay.classList.add('rolling');
    renderDiceFace('?');

    setTimeout(() => {
        diceValue = Math.floor(Math.random() * 6) + 1;
        console.log('[DICE] Выпало:', diceValue, '| Игрок:', players[currentPlayer]?.color, '| consecutiveSixes:', consecutiveSixes);

        diceDisplay.classList.remove('rolling');
        renderDiceFace(diceValue);
        diceRolled = true;
        canRollAgain = false;

        // Проверка на три шестёрки подряд
        if (diceValue === 6) {
            consecutiveSixes++;
            console.log('[DICE] Шестёрка! consecutiveSixes:', consecutiveSixes);
            
            if (consecutiveSixes >= 3) {
                console.log('[DICE] Три шестёрки подряд! Ход потерян');
                setMessage('Три шестёрки подряд! Ход потерян');
                consecutiveSixes = 0;
                setTimeout(() => {
                    diceRolled = false;
                    diceValue = 0;
                    nextPlayer();
                    updateUI();
                }, 1500);
                return;
            }
        }

        const player = players[currentPlayer];
        const movableTokens = player.getMovableTokens(diceValue);
        
        if (movableTokens.length === 0) {
            console.log('[DICE] Нет доступных ходов, автопропуск');
            startAutoSkip();
        } else if (autoMoveOnSingleOption && isSingleMoveOption(movableTokens)) {
            console.log('[DICE] Единственный ход, автоперемещение');
            setMessage('Автоход...');
            highlightMovableTokens();
            updateUI();
            setTimeout(() => {
                handleTokenClick(movableTokens[0]);
            }, 300);
            return;
        } else {
            console.log('[DICE] Есть доступные ходы:', movableTokens.length);
            setMessage('Выберите фишку для хода');
        }

        highlightMovableTokens();
        updateUI();
    }, 800);
}

function applyManualDice(value) {
    if (diceRolled && !canRollAgain) return;
    if (isAnimating) return;

    diceValue = value;
    renderDiceFace(diceValue);
    diceRolled = true;
    canRollAgain = false;

    // Проверка на три шестёрки подряд
    if (diceValue === 6) {
        consecutiveSixes++;
        console.log('[DICE] Шестёрка! consecutiveSixes:', consecutiveSixes);
        
        if (consecutiveSixes >= 3) {
            console.log('[DICE] Три шестёрки подряд! Ход потерян');
            setMessage('Три шестёрки подряд! Ход потерян');
            consecutiveSixes = 0;
            setTimeout(() => {
                diceRolled = false;
                diceValue = 0;
                nextPlayer();
                updateUI();
            }, 1500);
            return;
        }
    }

    const player = players[currentPlayer];
    const movableTokens = player.getMovableTokens(diceValue);
    
    if (movableTokens.length === 0) {
        startAutoSkip();
    } else if (autoMoveOnSingleOption && isSingleMoveOption(movableTokens)) {
        console.log('[DICE] Единственный ход, автоперемещение');
        setMessage('Автоход...');
        highlightMovableTokens();
        updateUI();
        setTimeout(() => {
            handleTokenClick(movableTokens[0]);
        }, 300);
        return;
    } else {
        setMessage('Выберите фишку для хода');
    }

    highlightMovableTokens();
    updateUI();
}

// Проверяет, является ли ход единственным вариантом
// (1 фишка или все фишки на базе - они все выходят на старт)
function isSingleMoveOption(movableTokens) {
    if (movableTokens.length === 1) return true;
    if (movableTokens.length === 0) return false;
    
    // Если все доступные фишки на базе - это единственный вариант
    // (все выйдут на одну и ту же стартовую позицию)
    return movableTokens.every(token => token.inBase);
}

function startAutoSkip() {
    let remaining = skipDelay;

    setMessage(`Нет возможных ходов. Пропуск через ${remaining}...`);

    // Clear any existing timers
    if (skipTimer) clearTimeout(skipTimer);
    if (countdownInterval) clearInterval(countdownInterval);

    countdownInterval = setInterval(() => {
        remaining--;
        if (remaining > 0) {
            setMessage(`Нет возможных ходов. Пропуск через ${remaining}...`);
        }
    }, 1000);

    skipTimer = setTimeout(() => {
        clearInterval(countdownInterval);
        autoSkipTurn();
    }, skipDelay * 1000);
}

function autoSkipTurn() {
    diceRolled = false;
    diceValue = 0;
    nextPlayer();
    updateUI();
}

function updateDelay() {
    skipDelay = parseInt(document.getElementById('delay-select').value);
    saveGame();
}

function nextPlayer() {
    const prevPlayer = players[currentPlayer]?.color;
    currentPlayer = (currentPlayer + 1) % players.length;
    consecutiveSixes = 0; // сброс счётчика шестёрок
    console.log('[GAME] nextPlayer:', prevPlayer, '->', players[currentPlayer]?.color);
    setMessage('Бросьте кубик');
    scheduleAutoRoll();
}

function toggleManualMode() {
    manualMode = !manualMode;
    const toggle = document.getElementById('manual-toggle');
    const manualContainer = document.getElementById('manual-dice-container');
    const rollBtn = document.getElementById('roll-btn');

    toggle.classList.toggle('active', manualMode);
    manualContainer.style.display = manualMode ? 'flex' : 'none';
    
    // Показать кнопку только если не ручной режим и не автобросок
    if (manualMode) {
        rollBtn.style.display = 'none';
    } else {
        rollBtn.style.display = autoRoll ? 'none' : 'block';
    }
    
    saveGame();
}

function toggleAutoMove() {
    autoMoveOnSingleOption = !autoMoveOnSingleOption;
    const toggle = document.getElementById('auto-move-toggle');
    toggle.classList.toggle('active', autoMoveOnSingleOption);
    saveGame();
}

function toggleAutoRoll() {
    autoRoll = !autoRoll;
    const toggle = document.getElementById('auto-roll-toggle');
    const rollBtn = document.getElementById('roll-btn');
    
    toggle.classList.toggle('active', autoRoll);
    
    // Скрыть/показать кнопку броска
    if (!manualMode) {
        rollBtn.style.display = autoRoll ? 'none' : 'block';
    }
    
    saveGame();
    
    // Если включили автобросок и сейчас можно бросить - бросаем
    if (autoRoll && players.length > 0) {
        scheduleAutoRoll();
    }
}

function scheduleAutoRoll() {
    if (!autoRoll || manualMode) return;
    
    setTimeout(() => {
        if (!autoRoll || manualMode) return;
        if (diceRolled && !canRollAgain) return;
        if (isAnimating) return;
        rollDice();
    }, 500);
}

function openSettings() {
    document.getElementById('settings-modal').classList.add('open');
}

function closeSettings() {
    document.getElementById('settings-modal').classList.remove('open');
}

function updateUI() {
    const player = players[currentPlayer];

    // Update background theme based on current player
    document.body.classList.remove('theme-red', 'theme-blue', 'theme-green', 'theme-yellow');
    document.body.classList.add(`theme-${player.color}`);

    const rollBtn = document.getElementById('roll-btn');
    
    // Скрыть кнопку если автобросок или ручной режим
    if (autoRoll && !manualMode) {
        rollBtn.style.display = 'none';
    } else if (!manualMode) {
        rollBtn.style.display = 'block';
        rollBtn.disabled = diceRolled && !canRollAgain;
    }

    // Блокировать/разблокировать ручные кубики
    const canUseManualDice = !diceRolled || canRollAgain;
    document.querySelectorAll('.manual-dice').forEach(d => {
        d.classList.toggle('disabled', !canUseManualDice || isAnimating);
    });

    // Auto-save game state
    saveGame();
}

// SVG точки для кубика
const DICE_DOTS = {
    1: [[25,25]],
    2: [[37,13],[13,37]],
    3: [[37,13],[25,25],[13,37]],
    4: [[13,13],[37,13],[13,37],[37,37]],
    5: [[13,13],[37,13],[25,25],[13,37],[37,37]],
    6: [[13,13],[37,13],[13,25],[37,25],[13,37],[37,37]]
};

function renderDiceFace(value) {
    const el = document.getElementById('dice-display');
    if (!value || value === '?') {
        el.innerHTML = '?';
        return;
    }
    const dots = DICE_DOTS[value];
    if (!dots) { el.innerHTML = value; return; }
    const circles = dots.map(([cx, cy]) => `<circle cx="${cx}" cy="${cy}" r="5" fill="#333"/>`).join('');
    el.innerHTML = `<svg viewBox="0 0 50 50" style="width:40px;height:40px">${circles}</svg>`;
}

function getColorHex(color) {
    const colors = {
        'yellow': '#f7d44c',
        'blue': '#5cc8d8',
        'red': '#e87878',
        'green': '#78c880'
    };
    return colors[color];
}

function setMessage(msg) {
    console.log('[MSG]', msg);
}

function showWinner(player) {
    const modal = document.getElementById('winner-modal');
    const text = document.getElementById('winner-text');
    text.textContent = `${PLAYER_NAMES[player.color]} победил!`;
    text.style.color = getColorHex(player.color);
    modal.style.display = 'flex';
}

// Save game state to localStorage
function saveGame() {
    // Don't save if no game in progress
    if (!players || players.length === 0) return;

    const gameState = {
        playerCount: playerCount,
        currentPlayer: currentPlayer,
        diceValue: diceValue,
        diceRolled: diceRolled,
        canRollAgain: canRollAgain,
        consecutiveSixes: consecutiveSixes,
        skipDelay: skipDelay,
        manualMode: manualMode,
        autoMoveOnSingleOption: autoMoveOnSingleOption,
        autoRoll: autoRoll,
        players: players.map(p => ({
            color: p.color,
            tokens: p.tokens.map(t => ({
                color: t.color,
                index: t.index,
                inBase: t.inBase,
                position: t.position,
                finished: t.finished
            }))
        }))
    };
    localStorage.setItem('ludoGame', JSON.stringify(gameState));
}

// Load game state from localStorage
function loadGame() {
    const saved = localStorage.getItem('ludoGame');
    if (!saved) return false;

    try {
        const state = JSON.parse(saved);

        playerCount = state.playerCount;
        currentPlayer = state.currentPlayer;
        diceValue = state.diceValue || 0;
        diceRolled = state.diceRolled || false;
        canRollAgain = state.canRollAgain || false;
        consecutiveSixes = state.consecutiveSixes || 0;
        skipDelay = state.skipDelay || 1;
        manualMode = state.manualMode || false;
        autoMoveOnSingleOption = state.autoMoveOnSingleOption || false;
        autoRoll = state.autoRoll || false;

        // Restore players
        players = [];
        for (const pData of state.players) {
            const player = new Player(pData.color);
            for (let i = 0; i < pData.tokens.length; i++) {
                player.tokens[i].inBase = pData.tokens[i].inBase;
                player.tokens[i].position = pData.tokens[i].position;
                player.tokens[i].finished = pData.tokens[i].finished;
            }
            players.push(player);
        }

        // Restore UI settings
        document.getElementById('delay-select').value = skipDelay;
        if (manualMode) {
            document.getElementById('manual-toggle').classList.add('active');
            document.getElementById('manual-dice-container').style.display = 'flex';
            document.getElementById('roll-btn').style.display = 'none';
        }
        if (autoMoveOnSingleOption) {
            document.getElementById('auto-move-toggle').classList.add('active');
        }
        if (autoRoll) {
            document.getElementById('auto-roll-toggle').classList.add('active');
            if (!manualMode) {
                document.getElementById('roll-btn').style.display = 'none';
            }
        }

        return true;
    } catch (e) {
        console.error('Error loading game:', e);
        return false;
    }
}

// Clear saved game
function clearSavedGame() {
    localStorage.removeItem('ludoGame');
}

// Initialize: try to load saved game or show setup
function init() {
    if (loadGame()) {
        // Resume saved game
        document.getElementById('setup-screen').style.display = 'none';
        document.getElementById('game-container').style.display = 'flex';
        document.getElementById('winner-modal').style.display = 'none';

        createBoard();
        updateUI();

        if (diceRolled && diceValue > 0) {
            renderDiceFace(diceValue);
            highlightMovableTokens();
        }
        
        // Автобросок при загрузке если нужно бросить
        if (!diceRolled || canRollAgain) {
            scheduleAutoRoll();
        }
    } else {
        showSetup();
    }
}

// Modify showSetup to clear saved game when starting new
const originalShowSetup = showSetup;
showSetup = function () {
    clearSavedGame();
    originalShowSetup();
};

// Start
init();
