#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""데모용 샘플 색인을 만든다 → js/seed-data.js

    python3 scripts/gen-seed.py

**기획자가 보낸 실제 사양서는 이 저장소에 없다.** 담당자 이름·휴대전화·
회사 이메일이 들어 있고 사내 자료다. 그래서 구조만 가져오고 값은 전부 지어낸다.

지어내되 **기벽까지 지어낸다.** 실제 폴더에 있던 것들을 샘플에도 넣는다.
  · 구형 「부품 설명」 양식 (항목이 몇 개 없다)
  · 사양서가 아닌 「구매 목록」
  · 파일명과 내용의 품번이 어긋난 파일
  · 라벨은 있는데 비어 있는 칸
매끈한 샘플만 넣으면 화면이 매끈해 보이고, 정작 실물을 넣는 날 무너진다.
"""
import io
import json
import os
import random

random.seed(20260826)                      # 돌릴 때마다 같은 샘플이 나오게

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

FULL = ['name', 'model', 'maker', 'use', 'material', 'unit', 'qtyPerUnit',
        'origin', 'detail', 'remark', 'bg', 'contact']
# 구형 「부품 설명」 양식에 있는 항목만
DESC_ONLY = ['name', 'model', 'maker', 'use', 'detail']

BG = ['건기 생산기술팀', 'Heavy BG 생산기술팀', '지원', '건기본부']
ORIGIN = ['한국', '중국', '일본', '독일', '']
# '대한호스' 같은 이름은 넣지 않는다 — '호스' 검색에 제조사가 걸려
# 샘플만 보면 검색이 틀린 것처럼 보인다. 규칙이 아니라 샘플의 문제다.
MAKERS = ['시중품', '대한고무', '신광공업', '한별테크', '미광정밀', '']

# 값은 전부 지어낸 것이다. 아래 이름·번호는 실재하지 않는다.
CONTACTS = [
    '김도현/ 010-0000-1111/ dohyun.kim@example.com',
    '박서준/ 010-0000-2222/ seojun.park@example.com',
    '이하늘/ 010-0000-3333/ haneul.lee@example.com',
    '',
]

ITEMS = [
    # (품번, 품명, 모델·규격, 용도, 재질, 구매단위, 단위당수량, 상세규격)
    ('420108-02540', 'HOSE,GAS;OXYGEN TWIN _FM USE', '산소호스(쌍줄)-30m',
     '산소용접기 호스교체용', '고무', 'RL', '30m', '규격 (외경x내경)\n14x8'),
    ('420103-00591', 'HOSE,FUEL', '실리콘 고열호스 / 150mm * 5m',
     '매연배기장치 내 사용되는 고무호스', 'Fiber Glass/실리콘 코팅', 'm', '1m', ''),
    ('420115-00042', 'HOSE,AIR;SPIRAL', '에어호스(스파이럴)-15m',
     '공압공구 연결용 에어호스', '우레탄', 'EA', '15m', '외경 10 / 내경 6.5'),
    ('101573-00018', 'RUBBER,MAGNET', '지름 130mm, 2t',
     '- 고무자석입니다.\n- 단품도장 마스킹용\n- 노란색 시트지를 부착한 제품',
     '고무', 'EA', '1', ''),
    ('101591-00057', 'WINDOW,SHOW', '아크릴 투시창 300x200',
     '제어반 점검창 교체용', '아크릴', 'EA', '1', '두께 5T'),
    ('102501-00471', 'TABLE ASSY;FOIL CUTTING', '호일 절단 작업대 1200x700',
     '단열 호일 절단 작업용 테이블', 'SS400', 'SET', '1', '상판 1200x700x30T'),
    ('500127-00068', 'URETHANE', '40*60*10T',
     'AXLE PALLET 보수用\n=> TOUCH-UP 개선 사항', '우레탄', 'EA', '1', ''),
    ('920101-00039', 'ANGLE;40X40X3T', 'ANGLE 40x40x3T',
     '개선반 운영용 자재\n- 재질 : SS400', 'SS400', 'EA', '2.5M', ''),
    ('920501-00663', 'PLATE,STEEL;FLAT BAR', 'FLAT BAR 19MM X 3T',
     '치구 제작용 평철', 'SS400', 'EA', '1', '19 x 3T x 4000L'),
    ('950212-04990', 'STICKER;AVM CALIBRATION', 'AVM 보정 스티커 600x600',
     'AVM 카메라 보정용 방수 스티커', 'PVC(방수)', 'EA', '1', '600x600 / Water Proof'),
    ('420132-00777', 'HOSE,WATER;BRAID', '워터호스(브레이드)-20m',
     '세척설비 용수 공급용 호스', 'PVC', 'RL', '20m', '외경 18 / 내경 12'),
    ('300221-00104', 'FILTER,AIR;COMPRESSOR', '에어컴프레서 필터 A-30',
     '컴프레서 흡입부 공기 여과용', '부직포', 'EA', '1', ''),
    ('101602-00311', 'BRUSH,WIRE;CUP', '컵형 와이어브러시 75mm',
     '용접 비드 제거용 브러시', '강선', 'EA', '1', '축경 6mm'),
    ('500310-00520', 'PAD,ANTI-VIBRATION', '방진패드 100x100x20T',
     '설비 하부 진동 저감용 패드', '고무', 'EA', '1', ''),
]


def field(value, state=None):
    if state == 'missing':
        return {'value': '', 'state': 'missing'}
    if value == '':
        return {'value': '', 'state': 'blank'}
    return {'value': value, 'state': 'filled'}


def build():
    recs = []
    for i, it in enumerate(ITEMS):
        pn, name, model, use, material, unit, qty, detail = it
        kind = 'spec'
        keys = FULL
        # 15건 중 3건은 구형 「부품 설명」 양식 — 항목이 몇 개 없다
        if i in (3, 6, 7):
            kind = 'desc'
            keys = DESC_ONLY
        f = {}
        allk = ['name', 'model', 'maker', 'use', 'material', 'unit',
                'qtyPerUnit', 'origin', 'detail', 'remark', 'bg', 'contact']
        for k in allk:
            if k not in keys:
                f[k] = field('', 'missing')
                continue
            v = {'name': name, 'model': model, 'use': use, 'material': material,
                 'unit': unit, 'qtyPerUnit': qty, 'detail': detail,
                 'maker': random.choice(MAKERS),
                 'origin': random.choice(ORIGIN),
                 'bg': random.choice(BG),
                 'remark': '' if random.random() < .55 else '납기 2주 소요',
                 'contact': random.choice(CONTACTS)}[k]
            f[k] = field(v)

        rec = {'partNo': pn, 'partNoSource': 'body', 'kind': kind,
               'file': '%s %s.xlsx' % (pn, name.replace('/', '_')),
               'sheet': '부품사양서' if kind == 'spec' else '부품사양',
               'fields': f}

        # 사양서 안에 품번이 없어 파일명에서 읽은 건 하나
        if pn == '500127-00068':
            rec['partNoSource'] = 'filename'
        recs.append(rec)

    # 사양서가 아닌 문서 — 검색 결과로 나오면 안 된다
    recs.append({
        'partNo': '300644-00023', 'partNoSource': 'filename', 'kind': 'purchase',
        'file': '300644-00023 REMOCON,TRANSMITTER(구매목록).xlsx', 'sheet': '구매목록',
        'fields': {k: field('', 'missing') for k in FULL},
    })
    # 파일명과 내용의 품번이 어긋난 건 — 사람이 봐야 한다
    src = [r for r in recs if r['partNo'] == '101602-00311'][0]
    conflict = json.loads(json.dumps(src))
    conflict['file'] = '101602-00312 BRUSH,WIRE;CUP.xlsx'   # 파일명은 …312
    conflict['partNo'] = '101602-00312'                      # 안에는 …311 이 적혀 있다
    conflict['partNoSource'] = 'conflict'
    recs[recs.index(src)] = conflict                          # 한 파일이므로 바꿔 넣는다
    return recs


def main():
    recs = build()
    body = json.dumps(recs, ensure_ascii=False, indent=1)
    out = os.path.join(HERE, 'js', 'seed-data.js')
    with io.open(out, 'w', encoding='utf-8') as f:
        f.write('/* scripts/gen-seed.py 가 만든 샘플입니다 — 손으로 고치지 마세요.\n'
                ' * 사내 실데이터가 아닙니다. 품번·이름·연락처는 전부 지어낸 값입니다. */\n')
        f.write('(function (root) {\n  root.SEED_INDEX = %s;\n'
                '}(typeof self !== "undefined" ? self : this));\n' % body)
    kinds = {}
    for r in recs:
        kinds[r['kind']] = kinds.get(r['kind'], 0) + 1
    print('%d 건 → js/seed-data.js' % len(recs))
    print('  종류: ' + ', '.join('%s %d' % kv for kv in sorted(kinds.items())))
    print('  기벽: 구형 양식 %d · 구매목록 %d · 품번 어긋남 %d · 파일명에서 읽음 %d' % (
        kinds.get('desc', 0), kinds.get('purchase', 0),
        len([r for r in recs if r['partNoSource'] == 'conflict']),
        len([r for r in recs if r['partNoSource'] == 'filename'])))


if __name__ == '__main__':
    main()
