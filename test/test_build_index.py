#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""scripts/build_index.py 의 파싱 규칙을 고정한다.

기획자가 보낸 실제 파일은 이 저장소에 없다(개인정보). 대신 그 10건에서
**실제로 관찰한 기벽**을 그대로 재현한 가짜 시트를 만들어 검사한다.
아래 주석의 "실제로 …" 는 전부 그 10건에서 본 것이다.

    python3 test/test_build_index.py
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'scripts'))
import build_index as B                                    # noqa: E402

passed = failed = 0


def group(t):
    print('\n%s' % t)


def ok(cond, label, detail=''):
    global passed, failed
    if cond:
        passed += 1
    else:
        failed += 1
        print('  X %s' % label)
        if detail:
            print('      %s' % detail)


def eq(got, want, label):
    ok(got == want, label, '기대: %r  실제: %r' % (want, got))


# ─────────────────────────────────────────── 1. 라벨로 찾는다
group('1. 칸을 위치가 아니라 라벨로 찾는다')

# 실제로: 품번이 B4 인 파일과 B3 인 파일이 섞여 있었다.
lower = {'B3': '부품 사양서(Spec. Sheet)', 'B4': '품   번', 'C4': '420108-02540'}
upper = {'B2': '부품 사양서(Spec. Sheet)', 'B3': '품   번', 'C3': '920501-00663'}
eq(B.find_field(lower, 'partNo'), ('420108-02540', 'filled'), '품번이 4행일 때')
eq(B.find_field(upper, 'partNo'), ('920501-00663', 'filled'), '품번이 3행일 때 (한 칸 밀림)')

# 실제로: 라벨은 B3 인데 값이 C 를 건너뛰고 D3 에 있는 파일이 있었다
gap = {'B3': '품   번', 'D3': '101573-00018'}
eq(B.find_field(gap, 'partNo'), ('101573-00018', 'filled'), '값이 한 칸 건너 있을 때')

# 실제로: 라벨 안에 폭 맞추기용 공백이 들어 있다 ('품   번', ' 용       도')
spaced = {'B5': ' 용       도', 'C5': '마스킹용'}
eq(B.find_field(spaced, 'use'), ('마스킹용', 'filled'), '라벨 사이 공백을 무시한다')


group('2. 같은 항목의 다른 이름을 하나로 본다')

# 실제로: 표준 양식은 '제조 Maker', 구형 양식은 '메 이 커' 였다
eq(B.find_field({'D4': '제조 Maker', 'E4': '신흥'}, 'maker'), ('신흥', 'filled'), '제조 Maker')
eq(B.find_field({'D4': '메 이 커', 'E4': '시장품'}, 'maker'), ('시장품', 'filled'), '메이커')
# 실제로: 어순이 뒤집힌다 — '모델 및 규격' / '규 격 및 모 델'
eq(B.find_field({'D4': '모델 및 규격', 'E4': 'A'}, 'model'), ('A', 'filled'), '모델 및 규격')
eq(B.find_field({'D3': ' 규 격 및 모 델', 'E3': 'B'}, 'model'), ('B', 'filled'), '규격 및 모델 (어순 반대)')


group('3. 없음 · 빈칸 · 채워짐을 구분한다')

eq(B.find_field({'B4': '품   번', 'C4': 'x'}, 'material'), (None, 'missing'), '항목 자체가 없으면 missing')
eq(B.find_field({'D6': '재질'}, 'material'), ('', 'blank'), '라벨은 있고 칸이 비면 blank')
eq(B.find_field({'D6': '재질', 'E6': 'SS400'}, 'material'), ('SS400', 'filled'), '값이 있으면 filled')

# 이 구분이 없으면 화면에서 둘 다 '-' 로 보인다. 사양서에 원래 없는 항목인지
# 담당자가 안 적은 것인지 구별할 수 없게 되고, 등록 요청을 할 수가 없다.
ok(B.find_field({'D6': '재질'}, 'material')[1] != B.find_field({}, 'material')[1],
   'blank 과 missing 은 서로 다른 상태다')


group('4. 같은 라벨이 여러 번 나오면 전부 담는다')

# 실제로: '용 도' 가 머리줄에 짧게, 본문에 길게 두 번 나오는 양식이 있었다.
# 앞엣것만 잡으면 검색이 걸려야 할 긴 문장을 통째로 버린다.
twice = {'J3': ' 용       도', 'K3': '마스킹용',
         'B5': '용    도', 'C5': '- 고무자석입니다.\n- 단품도장 마스킹용'}
value, state = B.find_field(twice, 'use')
eq(state, 'filled', '두 번 나와도 filled')
ok('마스킹용' in value and '고무자석' in value, '짧은 값과 긴 값이 모두 남는다', value)


group('5. 머리줄(헤더)을 값으로 읽지 않는다')

# 실제로: 구매목록의 머리줄이 '품번 | 품명 | 규격 | Maker' 였다.
# 라벨 오른쪽이 또 라벨이면 그 칸은 값이 아니다.
header = {'B4': '품번', 'C4': '품명', 'D4': '규격', 'E4': 'Maker'}
eq(B.find_field(header, 'partNo'), ('', 'blank'), '오른쪽이 또 다른 라벨이면 blank')


group('6. 사양서가 아닌 문서를 가려낸다')

eq(B.classify({'B3': '부품 사양서(Spec. Sheet)'}), 'spec', '부품 사양서')
eq(B.classify({'B2': '부품 설명'}), 'desc', '부품 설명 (구형 양식)')
eq(B.classify({'B2': '구매 목록'}), 'purchase', '구매 목록 — 사양서가 아니다')
eq(B.classify({'B2': '무언가'}), 'unknown', '알 수 없는 문서')

# 실제로: 시트 탭 이름이 '부품사양' 인데 내용은 '부품 설명' 인 파일이 있었다.
# 탭 이름을 믿으면 틀린다.
eq(B.classify({'B2': '부품 설명', 'B3': '품   번'}), 'desc', '탭 이름이 아니라 내용으로 가른다')


group('7. 파일명과 내용의 품번이 다르면 표시한다')

eq(B.resolve_part_no('420108-02540', '420108-02540'), ('420108-02540', 'body'), '둘이 같으면 body')
eq(B.resolve_part_no('101573-00018', ''), ('101573-00018', 'filename'), '내용이 비면 파일명에서')
eq(B.resolve_part_no('300644-00023', '999999-99999'),
   ('300644-00023', 'conflict'), '둘이 다르면 conflict 로 표시하고 파일명을 쓴다')
eq(B.resolve_part_no('', ''), ('', 'none'), '둘 다 없으면 none')

# 다를 때 조용히 한쪽을 고르면, 검색으로는 찾히는데 폴더에서는 그 파일이
# 없는 상태가 된다. 어느 쪽이 맞는지는 사람이 봐야 한다.
ok(B.resolve_part_no('A', 'B')[1] == 'conflict', '어긋남을 삼키지 않는다')


group('8. 품번 형식은 6자리-5자리다')

# 12번 프로젝트는 6-6 이었다. 계열이 다르므로 그대로 옮겨 쓰면 안 된다.
ok(B.PART_NO.search('420108-02540'), '420108-02540 은 품번이다')
ok(B.PART_NO.search('101573-00018'), '101573-00018 은 품번이다')
ok(not B.PART_NO.search('123456-100001'), '6-6 은 이 회사 품번이 아니다')
ok(not B.PART_NO.search('42010-02540'), '앞자리가 5자리면 품번이 아니다')


group('9. 값을 지어내지 않는다')

# 빈 시트에서 아무 항목이나 읽어도 값을 만들어 내면 안 된다
for key, _t, _a in B.FIELDS:
    v, s = B.find_field({}, key)
    ok(v is None and s == 'missing', '빈 시트에서 %s 는 missing' % key)


print('\n%s %d 통과 / %d 실패' % ('O' if not failed else 'X', passed, failed))
sys.exit(1 if failed else 0)
