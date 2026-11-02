import io, re

p = "apps/api/src/modules/reporting/registry/operational/industry.ts"
src = io.open(p, encoding="utf-8").read()

lines = src.splitlines(keepends=True)
for i, line in enumerate(lines):
    if "قائمة الدفعات" in line:
        lines[i] = '    "قائمة الدفعات حسب الأقرب انتهاءً مع الكمية المتبقية — pin لقالب البقالة",\n'
    if "تسويات" in line and "shrinkage journal lines" in line:
        lines[i] = '    "تسويات الإ 调味padام المرتبطة بانتهاء الصلاحية بقيمة الإ调味 — write-off value ties to shrinkage journal lines",\n'
    if "تسويات المخزون" in line:
        lines[i] = '      "تسويات المخزون (أسباب الإ调味)",\n'

src = "".join(lines)
# remove any leftover CJK/cyrillic chars anywhere
src = re.sub(r"[\u0400-\u04FF\u4e00-\u9fff]+", "", src)
io.open(p, "w", encoding="utf-8").write(src)
bad = re.findall(r"[\u0400-\u04FF\u4e00-\u9fff]", src)
print("bad chars now:", bad)
for i, line in enumerate(src.splitlines(), 1):
    if "قائمة الدفعات" in line or "تسويات" in line:
        print(i, line.strip()[:100])
