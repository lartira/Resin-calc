// Creates fictional demo data for the README screenshots (scripts/.demo-data.json).
// Everything here is made up: no real customers, prices or company details.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { calculateCost } from '../src/utils/calculations.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const svg = (body, w = 400, h = 300) =>
    'data:image/svg+xml;base64,' +
    Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`).toString('base64');

// Pigment swatch: a colored pour with a lighter swirl
const swatch = (a, b) => svg(`
    <defs><radialGradient id="g" cx="35%" cy="35%" r="80%"><stop offset="0" stop-color="${b}"/><stop offset="1" stop-color="${a}"/></radialGradient></defs>
    <rect width="400" height="300" fill="url(#g)"/>
    <path d="M-20 210 C 80 120, 160 280, 260 170 S 380 90, 430 140" stroke="${b}" stroke-width="26" fill="none" opacity=".55"/>
    <path d="M-20 90 C 90 30, 190 160, 300 70 S 400 40, 430 60" stroke="#fff" stroke-width="6" fill="none" opacity=".35"/>`);

// Wood / material texture: grain lines on a base color
const grain = (base, line) => svg(`
    <rect width="400" height="300" fill="${base}"/>
    ${Array.from({ length: 14 }, (_, i) => {
        const y = 12 + i * 21;
        return `<path d="M0 ${y} C 100 ${y - 9}, 200 ${y + 11}, 400 ${y - 4}" stroke="${line}" stroke-width="${2 + (i % 3)}" fill="none" opacity=".55"/>`;
    }).join('')}
    <ellipse cx="270" cy="140" rx="26" ry="12" fill="none" stroke="${line}" stroke-width="3" opacity=".6"/>`);

const solid = (base, accent) => svg(`
    <rect width="400" height="300" fill="${base}"/>
    <rect x="60" y="60" width="280" height="180" rx="16" fill="${accent}" opacity=".85"/>`);

const settings = {
    price1to1: 125,
    price2to1: 145,
    hourlyRate: 350,
    buffer: 10,
    moldWear: 15,
    vacuumCost: 10,
    consumables: 20,
    multiCastCost: 25,
    language: 'en',
    currency: 'kr',
    theme: 'dark',
    invoiceYear: 2026,
    invoiceSeq: 14,
    syncInterval: 10,
    enableBufferedSave: false,
    companyName: 'Nordic Resin Studio',
    companyAddress: 'Harbour Street 12',
    companyZipCity: '8000 Aarhus C',
    companyPhone: '+45 12 34 56 78',
    companyEmail: 'hello@example.com',
    companyWeb: 'example.com',
    companyLogo: ''
};

const colorCategories = ['Pearl pigment', 'Liquid', 'Alcohol Ink'];
const colors = [
    ['Ocean', 'Pearl pigment', '#0b3d91', '#4fc3f7', 18, '2 g per kg'],
    ['Emerald', 'Pearl pigment', '#0b5d3b', '#5fe3a1', 18, '2 g per kg'],
    ['Copper', 'Pearl pigment', '#7a3a12', '#f0a45a', 22, 'Metallic shine'],
    ['Galaxy', 'Pearl pigment', '#2b0d4f', '#b388ff', 20, 'Mix with black'],
    ['White', 'Liquid', '#c9d6df', '#ffffff', 12, 'For cells'],
    ['Black', 'Liquid', '#0a0a0a', '#555555', 12, 'Opaque'],
    ['Ruby', 'Alcohol Ink', '#6d0019', '#ff5a7a', 15, 'Few drops'],
    ['Sunset', 'Alcohol Ink', '#9a3b00', '#ffb347', 15, 'Few drops']
].map(([name, type, a, b, cost, note], i) => ({
    id: `c${i + 1}`, name, type, cost: String(cost), note, image: swatch(a, b)
}));

const materialCategories = ['Wood', 'Molds', 'Hardware', 'Finishing'];
const materials = [
    ['Oak slab', 'Wood', 650, grain('#b07a45', '#7a4d24'), 'Live edge'],
    ['Walnut', 'Wood', 420, grain('#5b3a24', '#2f1d10'), '40 × 120 cm'],
    ['Olive burl', 'Wood', 280, grain('#c9a66b', '#6f5227'), 'Pen blanks'],
    ['Table mold', 'Molds', 890, solid('#2b2f36', '#e05a8a'), '60 × 40 cm'],
    ['Hairpin legs', 'Hardware', 320, solid('#1d1f24', '#9aa3ad'), 'Set of 4'],
    ['Hard wax oil', 'Finishing', 150, solid('#3a2a1a', '#d8b36a'), '250 ml']
].map(([name, category, cost, image, note], i) => ({
    id: `m${i + 1}`, name, category, cost: String(cost), note, images: [image], image: ''
}));

const customers = [
    ['Anna Jensen', 'Birch Lane 4', '8200 Aarhus N', '', '+45 20 00 00 01', 'anna@example.com'],
    ['Oak & Stone Café', 'Market Square 9', '8000 Aarhus C', '12345678', '+45 20 00 00 02', 'orders@example.com'],
    ['Lars Nielsen', 'Fjord Road 21', '8600 Silkeborg', '', '+45 20 00 00 03', 'lars@example.com']
].map(([name, address, zipCity, cvr, phone, email], i) => ({
    id: `k${i + 1}`, name, address, zipCity, cvr, phone, email, ref: ''
}));

const mat = (m, quantity) => ({
    id: `${m.id}-${quantity}`, name: m.name, type: 'material', category: m.category,
    unitPrice: Number(m.cost), quantity, cost: Number(m.cost) * quantity, isSystemItem: true,
    note: '', showOnInvoice: true
});

const baseInputs = {
    customMaterials: [], projectNote: '', showProjectNoteOnInvoice: false, isProjectNoteOpen: false,
    extrasCost: 0, packagingCost: 0, useDrift: true, useVacuum: true, includeLabor: true,
    includeProfit: true, includeBuffer: true, includeMoldWear: true, note: '', projectImage: null,
    rounding: '', useMultiCast: false, multiCastCount: 0
};

const projects = [
    ['River table, oak & ocean blue', '14.09.2026', '10.12', 3200, 0, 240, [mat(materials[0], 1), mat(materials[4], 1)], 150, 120, '-5%'],
    ['Coaster set (6 pcs)', '17.09.2026', '14.45', 450, 0, 60, [], 0, 40, ''],
    ['Walnut serving board', '19.09.2026', '09.30', 0, 380, 75, [mat(materials[1], 1), mat(materials[5], 1)], 0, 60, ''],
    ['Olive wood pen blanks (10 pcs)', '22.09.2026', '16.05', 0, 520, 90, [mat(materials[2], 1)], 0, 30, ''],
    ['Galaxy wall clock', '24.09.2026', '11.20', 900, 0, 120, [], 180, 60, '+50'],
    ['Café tabletops (2 pcs)', '26.09.2026', '13.15', 5400, 0, 420, [mat(materials[0], 2), mat(materials[3], 1)], 0, 0, '-10%']
];

const entries = projects.map(([projectName, date, timestamp, g11, g21, time, customMaterials, extrasCost, packagingCost, rounding], i) => {
    const inputs = { ...baseInputs, projectName, amount1to1: g11, amount2to1: g21, time, customMaterials, extrasCost, packagingCost, rounding };
    return { id: 1758000000000 + i * 86400000, date, timestamp, ...inputs, results: calculateCost(inputs, settings) };
}).reverse(); // Newest first, like the app

// What the calculator tab shows in the screenshot
const session = {
    calculatorInputs: {
        ...baseInputs,
        projectName: 'River table, walnut & emerald',
        amount1to1: 4200,
        amount2to1: 0,
        time: 300,
        customMaterials: [mat(materials[1], 2), mat(materials[4], 1)],
        extrasCost: 180,
        packagingCost: 150,
        rounding: '-5%'
    },
    lastActiveTab: 'calculator'
};

const data = { settings, entries, colors, materials, customers, materialCategories, colorCategories };
fs.writeFileSync(path.join(dir, '.demo-data.json'), JSON.stringify({ data, session }));
console.log('demo data written');
