import io

p = "apps/api/src/modules/reporting/registry/operational/industry.ts"
lines = io.open(p, encoding="utf-8").read().splitlines(keepends=True)
for i, line in enumerate(lines):
    if "قائمة الدفعات" in line:
        lines[i] = '    "قائمة الدفعات حسب الأقرب انتهاءً مع الكمية المتبقية — pin لقالب البقالة",\n'
    if "تسويات" in line and "shrinkage" in line:
        lines[i] = '    "تسويات الإ 写offام المرتبطة بانتهاء الصلاحية بقيمة الإ 写off — write-off value ties to shrinkage journal lines",\n'
    if "تسويات المخزون" in line:
        lines[i] = '      "تسويات المخزون (أسباب الإ 写off)",\n'
io.open(p, "w", encoding="utf-8").writelines(lines)
print(io.open(p, encoding="utf-8").read()[600:1400])
