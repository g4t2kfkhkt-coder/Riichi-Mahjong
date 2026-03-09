const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadApp() {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const match = html.match(/<script>([\s\S]*)<\/script>/i);
    if (!match) throw new Error('Failed to locate embedded script in index.html');
    const source = `${match[1]}\n;globalThis.__testExports={state,getTileById,calculateYaku,calculateFu,calculateDoraCount,calculatePoints,isValidMahjongHand,normalizeTile,getTilesForTenpai};`;

    function makeElement() {
        return {
            innerHTML: '',
            value: '',
            checked: false,
            textContent: '',
            className: '',
            dataset: {},
            style: {},
            children: [],
            parentElement: null,
            classList: { toggle() {}, add() {}, remove() {} },
            addEventListener() {},
            appendChild(child) { this.children.push(child); child.parentElement = this; },
            querySelectorAll() { return []; },
            querySelector() { return null; },
        };
    }

    const elementCache = new Map();
    const document = {
        getElementById(id) {
            if (!elementCache.has(id)) elementCache.set(id, makeElement());
            return elementCache.get(id);
        },
        querySelector() { return makeElement(); },
        querySelectorAll() { return []; },
        createElement() { return makeElement(); },
    };

    const storage = new Map();
    const context = {
        console,
        window: {},
        document,
        localStorage: {
            getItem(key) { return storage.has(key) ? storage.get(key) : null; },
            setItem(key, value) { storage.set(key, String(value)); },
            removeItem(key) { storage.delete(key); },
        },
        alert() {},
        confirm() { return true; },
        setTimeout,
        clearTimeout,
    };

    context.window = context;
    vm.createContext(context);
    vm.runInContext(source, context);
    return context.__testExports;
}

const YAKU = {
    riichi: '\u7acb\u76f4',
    menzenTsumo: '\u95e8\u6e05\u81ea\u6478\u548c',
    tanyao: '\u65ad\u5e7a\u4e5d',
    pinfu: '\u5e73\u548c',
    chiitoi: '\u4e03\u5bf9\u5b50',
    iipeiko: '\u4e00\u676f\u53e3',
    ryanpeiko: '\u4e8c\u676f\u53e3',
    sanshokuDoshun: '\u4e09\u8272\u540c\u987a',
    ittsu: '\u4e00\u6c14\u901a\u8d2f',
    junchan: '\u7eaf\u5168\u5e26\u5e7a\u4e5d',
    chanta: '\u6df7\u5168\u5e26\u5e7a\u4e5d',
    honitsu: '\u6df7\u4e00\u8272',
    chinitsu: '\u6e05\u4e00\u8272',
    toitoi: '\u5bf9\u5bf9\u548c',
    sananko: '\u4e09\u6697\u523b',
    sanshokuDoko: '\u4e09\u8272\u540c\u523b',
    sankantsu: '\u4e09\u6760\u5b50',
    shosangen: '\u5c0f\u4e09\u5143',
    honroutou: '\u6df7\u8001\u5934',
    yakuhaiWhite: '\u5f79\u724c (\u767d)',
    yakuhaiGreen: '\u5f79\u724c (\u53d1)',
};

const app = loadApp();

function tile(id) {
    const result = app.getTileById(id);
    if (!result) throw new Error(`Unknown tile id: ${id}`);
    return result;
}

function tiles(ids = []) {
    return ids.map(tile);
}

function resetState(overrides = {}) {
    Object.assign(app.state, {
        fieldWind: 'east',
        seatWind: 'east',
        hand: [],
        melds: [],
        ankan: [],
        dora: [],
        uradora: [],
        winType: 'ron',
        isRiichi: false,
        isDoubleRiichi: false,
        ippatsu: false,
        haitei: false,
        houtei: false,
        chankan: false,
        tenhou: false,
        chiihou: false,
        honbaCount: 0,
        kyotakuCount: 0,
    });
    Object.assign(app.state, overrides);
}

function sumHan(yakuList) {
    return yakuList.reduce((sum, item) => sum + (item.han || 0), 0);
}

function sortStrings(values) {
    return [...values].sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'));
}

function runScoringCase(testCase) {
    resetState({
        fieldWind: testCase.fieldWind || 'east',
        seatWind: testCase.seatWind || 'east',
        winType: testCase.winType || 'ron',
        isRiichi: !!testCase.isRiichi,
        isDoubleRiichi: !!testCase.isDoubleRiichi,
        ippatsu: !!testCase.ippatsu,
        haitei: !!testCase.haitei,
        houtei: !!testCase.houtei,
        chankan: !!testCase.chankan,
        tenhou: !!testCase.tenhou,
        chiihou: !!testCase.chiihou,
        honbaCount: testCase.honbaCount || 0,
        kyotakuCount: testCase.kyotakuCount || 0,
        hand: tiles(testCase.hand),
        melds: (testCase.melds || []).map(tiles),
        ankan: tiles(testCase.ankan || []),
        dora: tiles(testCase.dora || []),
        uradora: tiles(testCase.uradora || []),
    });

    const winTile = tile(testCase.winTile);
    const yakuResult = app.calculateYaku(app.state.hand, winTile);
    const doraCount = app.calculateDoraCount(winTile);
    const hasScoringYaku = yakuResult.isYakuman || yakuResult.yakuList.length > 0;
    const totalHan = yakuResult.isYakuman ? null : (hasScoringYaku ? sumHan(yakuResult.yakuList) + doraCount : 0);
    const fu = hasScoringYaku ? app.calculateFu(winTile, yakuResult) : 0;
    const yakuNames = sortStrings(yakuResult.yakuList.map(item => item.name));

    return {
        yakuResult,
        yakuNames,
        doraCount,
        totalHan,
        fu,
    };
}

function sameSet(left, right) {
    const leftSorted = sortStrings(left);
    const rightSorted = sortStrings(right);
    return JSON.stringify(leftSorted) === JSON.stringify(rightSorted);
}

function assertCase(testCase, result) {
    const failures = [];
    if (testCase.expectedYaku && !sameSet(result.yakuNames, testCase.expectedYaku)) {
        failures.push(`expected yaku ${JSON.stringify(sortStrings(testCase.expectedYaku))}, got ${JSON.stringify(result.yakuNames)}`);
    }
    if (testCase.absentYaku) {
        const hit = testCase.absentYaku.filter(name => result.yakuNames.includes(name));
        if (hit.length) failures.push(`unexpected yaku ${JSON.stringify(sortStrings(hit))}`);
    }
    if (typeof testCase.expectedHan === 'number' && result.totalHan !== testCase.expectedHan) {
        failures.push(`expected han ${testCase.expectedHan}, got ${result.totalHan}`);
    }
    if (typeof testCase.expectedFu === 'number' && result.fu !== testCase.expectedFu) {
        failures.push(`expected fu ${testCase.expectedFu}, got ${result.fu}`);
    }
    if (typeof testCase.expectedDora === 'number' && result.doraCount !== testCase.expectedDora) {
        failures.push(`expected dora ${testCase.expectedDora}, got ${result.doraCount}`);
    }
    if (typeof testCase.expectYakuman === 'boolean' && result.yakuResult.isYakuman !== testCase.expectYakuman) {
        failures.push(`expected yakuman=${testCase.expectYakuman}, got ${result.yakuResult.isYakuman}`);
    }
    return failures;
}

const scoringCases = [
    {
        id: 'user-open-koutsu-kantsu-no-sanankou',
        hand: ['1s'],
        melds: [['6s', '6s', '6s'], ['9m', '9m', '9m'], ['3p', '3p', '3p', '3p'], ['white', 'white', 'white', 'white']],
        winTile: '1s',
        expectedYaku: [YAKU.toitoi, YAKU.yakuhaiWhite],
        absentYaku: [YAKU.sananko],
        expectedHan: 3,
        expectedFu: 60,
        expectedDora: 0,
        expectYakuman: false,
    },
    {
        id: 'riichi-tsumo-pinfu-tanyao',
        hand: ['2m', '3m', '4m', '3p', '4p', '5p', '4s', '5s', '6s', '6p', '7p', '5m', '5m'],
        winTile: '8p',
        winType: 'tsumo',
        isRiichi: true,
        expectedYaku: [YAKU.riichi, YAKU.menzenTsumo, YAKU.tanyao, YAKU.pinfu],
        expectedHan: 4,
        expectedFu: 20,
        expectedDora: 0,
        expectYakuman: false,
    },
    {
        id: 'riichi-ron-pinfu-tanyao',
        hand: ['2m', '3m', '4m', '3p', '4p', '5p', '4s', '5s', '6s', '6p', '7p', '5m', '5m'],
        winTile: '8p',
        isRiichi: true,
        expectedYaku: [YAKU.riichi, YAKU.tanyao, YAKU.pinfu],
        expectedHan: 3,
        expectedFu: 30,
        expectedDora: 0,
        expectYakuman: false,
    },
    {
        id: 'riichi-chiitoitsu',
        hand: ['2m', '2m', '3m', '3m', '4p', '4p', '5p', '5p', '6s', '6s', '7s', '7s', 'white'],
        winTile: 'white',
        isRiichi: true,
        expectedYaku: [YAKU.riichi, YAKU.chiitoi],
        expectedHan: 3,
        expectedFu: 25,
        expectedDora: 0,
        expectYakuman: false,
    },
    {
        id: 'iipeiko-only',
        hand: ['2m', '2m', '3m', '3m', '4m', '4m', '4p', '5p', '6p', '6s', '7s', '8s', '5s'],
        winTile: '5s',
        expectedYaku: [YAKU.iipeiko, YAKU.tanyao],
        expectedHan: 2,
        expectedFu: 40,
        expectedDora: 0,
        expectYakuman: false,
    },
    {
        id: 'ryanpeiko-tanyao',
        hand: ['2m', '2m', '3m', '3m', '4m', '4m', '5p', '5p', '6p', '6p', '7p', '7p', '8s'],
        winTile: '8s',
        expectedYaku: [YAKU.ryanpeiko, YAKU.tanyao],
        expectedHan: 4,
        expectedFu: 40,
        expectedDora: 0,
        expectYakuman: false,
    },
    {
        id: 'sanshoku-closed',
        hand: ['1m', '2m', '3m', '1p', '2p', '3p', '1s', '2s', '3s', '4m', '5m', '6m', '7p'],
        winTile: '7p',
        expectedYaku: [YAKU.sanshokuDoshun],
        expectedHan: 2,
        expectedFu: 40,
        expectedDora: 0,
        expectYakuman: false,
    },
    {
        id: 'sanshoku-open',
        hand: ['1m', '2m', '1s', '2s', '3s', '4m', '5m', '6m', '7p', '7p'],
        melds: [['1p', '2p', '3p']],
        winTile: '3m',
        expectedYaku: [YAKU.sanshokuDoshun],
        expectedHan: 1,
        expectedFu: 30,
        expectedDora: 0,
        expectYakuman: false,
    },
    {
        id: 'ittsu-closed',
        hand: ['1m', '2m', '3m', '4m', '5m', '6m', '7m', '8m', '9m', '2p', '4p', '5s', '5s'],
        winTile: '3p',
        expectedYaku: [YAKU.ittsu],
        expectedHan: 2,
        expectedFu: 40,
        expectedDora: 0,
        expectYakuman: false,
    },
    {
        id: 'ittsu-open',
        hand: ['4m', '5m', '6m', '7m', '8m', '9m', '2p', '4p', '5s', '5s'],
        melds: [['1m', '2m', '3m']],
        winTile: '3p',
        expectedYaku: [YAKU.ittsu],
        expectedHan: 1,
        expectedFu: 30,
        expectedDora: 0,
        expectYakuman: false,
    },
    {
        id: 'junchan-closed',
        hand: ['1m', '2m', '7m', '8m', '9m', '1p', '2p', '3p', '7p', '8p', '9p', '1s', '1s'],
        winTile: '3m',
        expectedYaku: [YAKU.junchan],
        expectedHan: 3,
        expectedFu: 40,
        expectedDora: 0,
        expectYakuman: false,
    },
    {
        id: 'chanta-open',
        hand: ['7m', '8m', '9m', '1p', '2p', '3p', 'east', 'east', 'east', '1s'],
        melds: [['1m', '2m', '3m']],
        winTile: '1s',
        fieldWind: 'south',
        seatWind: 'west',
        expectedYaku: [YAKU.chanta],
        expectedHan: 1,
        expectedFu: 30,
        expectedDora: 0,
        expectYakuman: false,
    },
    {
        id: 'honitsu-open',
        hand: ['2m', '3m', '4m', '6m', '7m', '8m', 'east', 'east', 'east', '1m'],
        melds: [['1m', '2m', '3m']],
        winTile: '1m',
        fieldWind: 'south',
        seatWind: 'west',
        expectedYaku: [YAKU.honitsu],
        expectedHan: 2,
        expectedFu: 30,
        expectedDora: 0,
        expectYakuman: false,
    },
    {
        id: 'chinitsu-plus-ittsu',
        hand: ['1m', '2m', '3m', '4m', '5m', '6m', '7m', '8m', '9m', '2m', '4m', '5m', '5m'],
        winTile: '3m',
        expectedYaku: [YAKU.ittsu, YAKU.chinitsu],
        expectedHan: 8,
        expectedFu: 40,
        expectedDora: 0,
        expectYakuman: false,
    },
    {
        id: 'toitoi-sanankou',
        hand: ['1p', '1p', '1p', '2s', '2s', '2s', '3m', '3m', '3m', 'east'],
        melds: [['9m', '9m', '9m']],
        winTile: 'east',
        fieldWind: 'south',
        seatWind: 'west',
        expectedYaku: [YAKU.toitoi, YAKU.sananko],
        expectedHan: 4,
        expectedFu: 50,
        expectedDora: 0,
        expectYakuman: false,
    },
    {
        id: 'sanshoku-doko-toitoi-sanankou',
        hand: ['2m', '2m', '2m', '2p', '2p', '2p', '2s', '2s', '2s', '9m', '9m', 'east', 'east'],
        winTile: '9m',
        fieldWind: 'south',
        seatWind: 'west',
        expectedYaku: [YAKU.toitoi, YAKU.sananko, YAKU.sanshokuDoko],
        expectedHan: 6,
        expectedFu: 50,
        expectedDora: 0,
        expectYakuman: false,
    },
    {
        id: 'sankantsu',
        hand: ['6p', '7p', 'east', 'east'],
        melds: [['2m', '2m', '2m', '2m'], ['3p', '3p', '3p', '3p']],
        ankan: ['4s'],
        winTile: '8p',
        fieldWind: 'south',
        seatWind: 'west',
        expectedYaku: [YAKU.sankantsu],
        expectedHan: 2,
        expectedFu: 60,
        expectedDora: 0,
        expectYakuman: false,
    },
    {
        id: 'shosangen',
        hand: ['white', 'white', 'white', 'rich', 'rich', 'rich', '1m', '2m', '3m', '4p', '5p', '6p', 'red'],
        winTile: 'red',
        expectedYaku: [YAKU.yakuhaiWhite, YAKU.yakuhaiGreen, YAKU.shosangen],
        expectedHan: 4,
        expectedFu: 50,
        expectedDora: 0,
        expectYakuman: false,
    },
    {
        id: 'honroutou-chiitoi',
        hand: ['1m', '1m', '9m', '9m', '1p', '1p', '9p', '9p', '1s', '1s', '9s', '9s', 'white'],
        winTile: 'white',
        expectedYaku: [YAKU.chiitoi, YAKU.honroutou],
        expectedHan: 4,
        expectedFu: 25,
        expectedDora: 0,
        expectYakuman: false,
    },
    {
        id: 'red-dora-stacks-with-normal-dora',
        hand: ['2m', '3m', '4m', '3p', '4p', '5p', '4s', '5s', '6s', '6p', '7p', '0m', '5m'],
        winTile: '8p',
        winType: 'tsumo',
        dora: ['4m'],
        expectedYaku: [YAKU.menzenTsumo, YAKU.tanyao, YAKU.pinfu],
        expectedHan: 6,
        expectedFu: 20,
        expectedDora: 3,
        expectYakuman: false,
    },
    {
        id: 'closed-honor-quad-fu',
        hand: ['2m', '3m', '4m', '3m', '4m', '5m', '6p', '7p', '8p', 'east'],
        ankan: ['white'],
        winTile: 'east',
        expectedYaku: [YAKU.yakuhaiWhite],
        expectedHan: 1,
        expectedFu: 70,
        expectedDora: 0,
        expectYakuman: false,
    },
    {
        id: 'open-tanyao-special-30-fu',
        hand: ['3m', '4m', '5m', '6m', '7m', '8m', '2p', '3p', '5s', '5s'],
        melds: [['2m', '3m', '4m']],
        winTile: '4p',
        expectedYaku: [YAKU.tanyao],
        expectedHan: 1,
        expectedFu: 30,
        expectedDora: 0,
        expectYakuman: false,
    },
    {
        id: 'open-honor-quad-fu',
        hand: ['2m', '3m', '4m', '3m', '4m', '5m', '6p', '7p', '8p', 'east'],
        melds: [['white', 'white', 'white', 'white']],
        winTile: 'east',
        expectedYaku: [YAKU.yakuhaiWhite],
        expectedHan: 1,
        expectedFu: 50,
        expectedDora: 0,
        expectYakuman: false,
    },
    {
        id: 'open-simple-quad-fu',
        hand: ['2m', '3m', '4m', '3m', '4m', '5m', '6p', '7p', '8p', '5s'],
        melds: [['6s', '6s', '6s', '6s']],
        winTile: '5s',
        expectedYaku: [YAKU.tanyao],
        expectedHan: 1,
        expectedFu: 30,
        expectedDora: 0,
        expectYakuman: false,
    },
];

const invariantCases = [
    {
        id: 'open-chi-cannot-be-recombined-into-toitoi',
        hand: ['1m', '1m', '2m', '2m', '3m', '3m', '4p', '4p', '4p', 'north'],
        melds: [['1m', '2m', '3m']],
        winTile: 'north',
        absentYaku: [YAKU.toitoi],
    },
    {
        id: 'ron-shanpon-does-not-create-sanankou',
        hand: ['1p', '1p', '1p', '2s', '2s', '2s', '3m', '4m', '5m', 'north', 'north', '8s', '8s'],
        winTile: '8s',
        absentYaku: [YAKU.sananko],
    },
];

let passed = 0;
let failed = 0;

for (const testCase of scoringCases) {
    const result = runScoringCase(testCase);
    const failures = assertCase(testCase, result);
    if (failures.length) {
        failed += 1;
        console.error(`FAIL ${testCase.id}`);
        failures.forEach(message => console.error(`  - ${message}`));
    } else {
        passed += 1;
        console.log(`PASS ${testCase.id}`);
    }
}

for (const testCase of invariantCases) {
    const result = runScoringCase(testCase);
    const failures = assertCase(testCase, result);
    if (failures.length) {
        failed += 1;
        console.error(`FAIL ${testCase.id}`);
        failures.forEach(message => console.error(`  - ${message}`));
    } else {
        passed += 1;
        console.log(`PASS ${testCase.id}`);
    }
}

console.log(`\nSummary: ${passed} passed, ${failed} failed.`);

if (failed > 0) process.exit(1);
