#!/usr/bin/env python3
"""
Dataset Generator for National Unified Material Master System
Creates SQLite database with synthetic material records across multiple CPSEs.
"""

import sqlite3
import random

DB_NAME = 'materials.sqlite'
TOTAL_RECORDS = 1000
CPSE_LIST = [
    'ONGC', 'NTPC', 'SAIL', 'BHEL', 'GAIL',
    'IOCL', 'BPCL', 'HPCL', 'Coal India', 'NMDC'
]

# (category, sub_category, base_name, sizes, pressures, materials, ends, uom)
MATERIAL_TEMPLATES = [
    # Valves
    ('Valve', 'Ball Valve',       'Ball Valve',       ['0.5','1','1.5','2','3','4','6','8'],       ['150','300','600','800','900'],       ['SS316','SS304','CS','Alloy Steel'],   ['RF','RTJ','Threaded','Welded'],     'NOS'),
    ('Valve', 'Gate Valve',       'Gate Valve',       ['2','3','4','6','8','10','12'],              ['150','300','600','900'],             ['CS','SS316','SS304','Alloy Steel'],   ['RF','RTJ','Flanged','Welded'],      'NOS'),
    ('Valve', 'Globe Valve',      'Globe Valve',      ['0.5','1','1.5','2','3'],                   ['300','600','800','1500'],            ['SS304','SS316','CS'],                ['Threaded','Flanged','Welded'],      'NOS'),
    ('Valve', 'Check Valve',      'Check Valve',      ['1','1.5','2','3','4','6'],                 ['150','300','600','800'],             ['SS316','CS','Alloy Steel'],           ['RF','RTJ','Threaded'],              'NOS'),
    ('Valve', 'Butterfly Valve',  'Butterfly Valve',  ['2','3','4','6','8','10','12'],              ['150','300'],                        ['CS','SS316','Ductile Iron'],          ['Wafer','Lug','Flanged'],            'NOS'),
    # Pipes
    ('Pipe', 'CS Pipe',    'Carbon Steel Pipe',      ['0.5','1','2','3','4','6','8','10','12'],    ['Sch 40','Sch 80','Sch 160'],         ['CS'],                                ['Seamless','ERW'],                  'MTR'),
    ('Pipe', 'SS Pipe',    'Stainless Steel Pipe',   ['0.5','1','2','3','4','6','8'],              ['Sch 10','Sch 40','Sch 80'],          ['SS304','SS316'],                     ['Seamless','Welded'],               'MTR'),
    ('Pipe', 'Alloy Pipe', 'Alloy Steel Pipe',       ['1','2','3','4','6'],                       ['Sch 80','Sch 160'],                  ['Alloy Steel'],                       ['Seamless'],                        'MTR'),
    # Flanges
    ('Flange', 'RF Flange',  'Flange', ['0.5','1','2','3','4','6','8','10','12'], ['150','300','600','900'],       ['SS316','SS304','CS'], ['RF'],  'NOS'),
    ('Flange', 'RTJ Flange', 'Flange', ['1','2','3','4','6','8'],                ['300','600','900','1500'],      ['CS','SS316','SS304'], ['RTJ'], 'NOS'),
    # Bearings
    ('Bearing', 'Deep Groove',       'Ball Bearing',   ['6205','6206','6207','6208','6305','6306'], [''], ['2RS','ZZ','Open'],       [''], 'NOS'),
    ('Bearing', 'Cylindrical Roller','Roller Bearing', ['NU206','NU207','NU208','NJ306','NJ307'],   [''], ['C3','C4','Standard'],   [''], 'NOS'),
    ('Bearing', 'Needle Bearing',    'Needle Bearing', ['HK2012','HK2020','HK2520','NA4904'],       [''], [''],                    [''], 'NOS'),
    # Gaskets
    ('Gasket', 'Spiral Wound', 'Gasket', ['1','2','3','4','6','8','10'], ['150','300','600'], ['SS316','SS304'], ['Graphite','PTFE'], 'NOS'),
    # Electrical
    ('Electrical', 'Cable', 'Power Cable',      ['1.5','2.5','4','6','10','16','25'],        ['1.1kV','3.3kV','6.6kV','11kV'],           ['Cu','Al'],           ['XLPE','PVC','Armoured'],    'MTR'),
    ('Electrical', 'Motor', 'Induction Motor',  ['0.5','1','2','5','10','15','30','50'],     ['2 Pole','4 Pole','6 Pole'],               ['TEFC','Flameproof'], ['IE2','IE3','IE4'],          'NOS'),
    # Instrumentation
    ('Instrumentation', 'Pressure Gauge',      'Pressure Gauge',      ['0-10 bar','0-25 bar','0-100 bar','0-400 bar'], ['1/2 NPT','1/4 NPT'],                          ['SS316','Brass'], ['Bourdon','Diaphragm'],            'NOS'),
    ('Instrumentation', 'Pressure Transmitter','Pressure Transmitter',['0-10 bar','0-25 bar','0-100 bar'],             ['4-20mA','HART','Foundation Fieldbus'],         ['SS316'],         ['Absolute','Gauge','Differential'],'NOS'),
]


def make_code(cpse: str, category: str) -> str:
    cat_map = {
        'Valve': 'VLV', 'Pipe': 'PIP', 'Flange': 'FLG', 'Bearing': 'BRG',
        'Gasket': 'GKT', 'Electrical': 'ELE', 'Instrumentation': 'INS'
    }
    cat = cat_map.get(category, 'GEN')
    formats = {
        'ONGC':       f'MAT-{random.randint(10000,99999)}',
        'NTPC':       f'{cat}-{random.randint(1000,9999)}',
        'SAIL':       f'{random.randint(4000,4999)}-{cat}',
        'BHEL':       f'{cat[:2]}-{random.randint(100,999)}-{random.choice(["A","B","C"])}',
        'GAIL':       f'G-{cat}-{random.randint(10000,99999)}',
        'IOCL':       f'IOC-{cat}-{random.randint(1000,9999)}',
        'BPCL':       f'BPC-{cat}-{random.randint(1000,9999)}',
        'HPCL':       f'HPC-{cat}-{random.randint(1000,9999)}',
        'Coal India': f'CI-{cat}-{random.randint(1000,9999)}',
        'NMDC':       f'NMD-{cat}-{random.randint(1000,9999)}',
    }
    return formats.get(cpse, f'{cat}-{random.randint(1000,9999)}')


def make_description(cpse: str, base_name: str, size: str, pressure: str,
                     material: str, ends: str) -> str:
    pressure_str = pressure or ''
    material_str = material or ''
    ends_str     = ends or ''
    if cpse == 'ONGC':
        return f'{base_name} {size} inch {pressure_str}# {material_str} {ends_str}'.strip()
    elif cpse == 'NTPC':
        return f'{base_name.upper()} {size}IN {material_str} {pressure_str}LB {ends_str}'.strip()
    elif cpse == 'SAIL':
        return f'{size} inch Class {pressure_str} {material_str} {base_name} {ends_str}'.strip()
    elif cpse == 'BHEL':
        return f'{base_name}, {size}", {material_str}, {pressure_str} Rating, {ends_str}'.strip()
    elif cpse == 'GAIL':
        return f'{base_name} {size} INCH {pressure_str} CLASS {material_str} {ends_str}'.strip()
    elif cpse == 'IOCL':
        return f'{base_name} {size}IN {pressure_str}# {material_str} {ends_str}'.strip()
    elif cpse == 'BPCL':
        return f'{base_name} {size} IN {pressure_str} LB {material_str} {ends_str}'.strip()
    elif cpse == 'HPCL':
        return f'{base_name} {size}INCH {pressure_str}LB {material_str} {ends_str}'.strip()
    elif cpse == 'Coal India':
        return f'{base_name} {size} inch {pressure_str} class {material_str} {ends_str}'.strip()
    elif cpse == 'NMDC':
        return f'{base_name} {size}" {pressure_str}# {material_str} {ends_str}'.strip()
    else:
        return f'{base_name} {size} inch {pressure_str}# {material_str} {ends_str}'.strip()


def create_database():
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS materials (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            cpse          TEXT NOT NULL,
            material_code TEXT NOT NULL,
            description   TEXT NOT NULL,
            uom           TEXT NOT NULL,
            category      TEXT,
            sub_category  TEXT
        )
    ''')
    cursor.execute('DELETE FROM materials')

    records = []
    used_codes: set = set()

    for _ in range(TOTAL_RECORDS):
        cpse     = random.choice(CPSE_LIST)
        template = random.choice(MATERIAL_TEMPLATES)
        category, sub_category, base_name, sizes, pressures, materials, ends, uom = template

        size     = random.choice(sizes)
        pressure = random.choice(pressures) if pressures and pressures[0] else ''
        material = random.choice(materials) if materials and materials[0] else ''
        end      = random.choice(ends)      if ends      and ends[0]      else ''

        # Occasional UOM variation to simulate real-world inconsistency
        if random.random() < 0.1:
            uom = random.choice(['NOS', 'EA', 'PCS', 'MTR', 'M'])

        code = make_code(cpse, category)
        while (cpse, code) in used_codes:
            code = make_code(cpse, category)
        used_codes.add((cpse, code))

        desc = make_description(cpse, base_name, size, pressure, material, end)

        # Inject near-duplicate noise
        if random.random() < 0.3:
            desc = desc.replace('inch', random.choice(['inch', 'in', '"']))
        if random.random() < 0.2:
            desc = desc.replace('#', random.choice(['#', 'LB', 'Class']))
        if random.random() < 0.15:
            desc = desc.upper() if random.random() < 0.5 else desc.lower()

        records.append((cpse, code, desc, uom, category, sub_category))

    cursor.executemany('''
        INSERT INTO materials (cpse, material_code, description, uom, category, sub_category)
        VALUES (?, ?, ?, ?, ?, ?)
    ''', records)

    conn.commit()
    conn.close()

    print(f"Database '{DB_NAME}' created with {len(records)} records.")
    print("Records per CPSE:")
    for cpse in CPSE_LIST:
        count = sum(1 for r in records if r[0] == cpse)
        print(f"  {cpse}: {count}")


if __name__ == '__main__':
    create_database()
