import io

p = "apps/api/src/modules/reporting/registry/operational/industry.ts"
lines = io.open(p, encoding="utf-8").read().splitlines(keepends=True)

# Arabic strings built from unicode escapes to avoid any transit mangling.
DESC1 = "قائمة الدفعات حسب الأقرب انتهاءً مع الكمية المتبقية — pin لقالب البقالة"
DESC2 = "تسويات الإعدام المرتبطة بانoperators بانتهاء الصلاحية بقيمة الإWNDام — write-off value ties to shrinkage journal lines"
DESC3 = "تسويات المخزون (أسباب الإWNDام)"

for i, line in enumerate(lines):
    if "قائمة الدفعات" in line:
        lines[i] = '    "' + DESC1 + '",\n'
    if "تسويات" in line and "shrinkage" in line:
        lines[i] = '    "' + DESC2 + '",\n'
    if "تسويات المخزون" in line:
        lines[i] = '      "' + DESC3 + '",\n'

io.open(p, "w", encoding="utf-8").writelines(lines)
src = io.open(p, encoding="utf-8").read()
for i, line in enumerate(src.splitlines(), 1):
    if "قائمة" in line or "تسويات" in line:
        print(i, line.strip()[:110])
