"""Visual-only design system patch for ClockInOut.tsx"""
from pathlib import Path

p = Path(__file__).resolve().parents[1] / "src/pages/ClockInOut.tsx"
text = p.read_text(encoding="utf-8")

# 1) Header + grid open
old_header = '''  return (
    <motion className="w-full min-h-screen">
      {/* Title Bar - same layout and font sizes as Projects / Customers */}
      <motion className="rounded-xl border bg-white p-4 mb-4">'''.replace("<motion", "<div").replace("</motion>", "</motion>")
old_header = '''  return (
    <motion className="w-full min-h-screen">
      {/* Title Bar - same layout and font sizes as Projects / Customers */}
      <motion className="rounded-xl border bg-white p-4 mb-4">'''

# Fix - use exact content from file
old_header = """  return (
    <div className="w-full min-h-screen">
      {/* Title Bar - same layout and font sizes as Projects / Customers */}
      <div className="rounded-xl border bg-white p-4 mb-4">"""

helpers = """
  const hourSelectOptions = useMemo(
    () => Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) })),
    [],
  );
  const minuteSelectOptions = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const m = i * 5;
        return { value: String(m).padStart(2, '0'), label: String(m).padStart(2, '0') };
      }),
    [],
  );
  const amPmSelectOptions = useMemo(
    () => [
      { value: 'AM', label: 'AM' },
      { value: 'PM', label: 'PM' },
    ],
    [],
  );
  const breakHourOptions = useMemo(
    () => Array.from({ length: 3 }, (_, i) => ({ value: String(i), label: String(i) })),
    [],
  );
  const breakMinuteOptions = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const m = i * 5;
        return { value: String(m).padStart(2, '0'), label: String(m).padStart(2, '0') };
      }),
    [],
  );

  const closeEditModal = () => {
    setEditingAttendance(null);
    setEditingType(null);
    setEditTime('');
    setEditHour12('');
    setEditMinute('');
    setEditAmPm('AM');
  };

  const closeBreakTimeModal = () => {
    setEditingBreakTimeAttendance(null);
    setEditBreakTimeHours('0');
    setEditBreakTimeMinutes('0');
  };

"""

new_header = helpers + """  return (
    <div className={uiCx(uiSpacing.pageStack, 'min-h-screen w-full')}>
      <AppPageHeader
        title="Clock In / Out"
        subtitle="Track your work hours and manage your attendance"
        icon={<Clock className="h-4 w-4" />}
        actions={
          <div className="text-right">
            <div className={uiTypography.overline}>Today</motion>
            <div className={uiCx(uiTypography.sectionTitle, 'mt-0.5')}>{todayLabel}</motion>
          </motion>
        }
      />

      <div className={uiCx('grid grid-cols-[1.2fr_1fr] items-start', uiSpacing.sectionStack)}>"""

new_header = new_header.replace("<motion", "<div").replace("</motion>", "</motion>")
new_header = new_header.replace("<motion", "<div").replace("</motion>", "</motion>")
# manual fix
new_header = helpers + """  return (
    <div className={uiCx(uiSpacing.pageStack, 'min-h-screen w-full')}>
      <AppPageHeader
        title="Clock In / Out"
        subtitle="Track your work hours and manage your attendance"
        icon={<Clock className="h-4 w-4" />}
        actions={
          <div className="text-right">
            <motion className={uiTypography.overline}>Today</motion>
            <div className={uiCx(uiTypography.sectionTitle, 'mt-0.5')}>{todayLabel}</div>
          </div>
        }
      />

      <div className={uiCx('grid grid-cols-[1.2fr_1fr] items-start', uiSpacing.sectionStack)}>"""

# Fix motion typos in new_header
new_header = new_header.replace("<motion className={uiTypography.overline}>Today</motion>", "<motion className={uiTypography.overline}>Today</motion>")
new_header = new_header.replace("<motion className={uiTypography.overline}>Today</motion>", '<div className={uiTypography.overline}>Today</div>')

if old_header not in text:
    raise SystemExit("header block not found")

# Remove title bar inner through grid line
start = text.index(old_header)
end = text.index("      <div className=\"grid grid-cols-[1.2fr_1fr] gap-4\">") + len("      <div className=\"grid grid-cols-[1.2fr_1fr] gap-4\">")
text = text[:start] + new_header + text[end:]

# 2) Clock actions card open
text = text.replace(
    """          {/* CARD 1 — Clock Actions (Action-Focused) */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-gray-900">Clock Actions</div>""",
    """          <AppCard
            title="Clock Actions"
            bodyClassName={uiSpacing.sectionStack}
            actions={
            <div className="relative">""",
    1,
)

# Close actions header row - replace date section end before clock buttons
text = text.replace(
    """              </div>
            </div>
            
            <div className="space-y-3">
              {/* Clock In Action Tile */}
              <button
                onClick={() => setClockType('in')}
                disabled={hasOpenClockIn || !canClockIn || modalSubmitting}
                className={`w-full rounded-xl border-2 p-4 text-left transition-all duration-200 ${
                  !hasOpenClockIn && canClockIn && !modalSubmitting
                    ? 'border-green-200 bg-green-50/50 hover:border-green-300 hover:bg-green-50 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] cursor-pointer'
                    : 'border-gray-200 bg-gray-50/50 cursor-not-allowed opacity-60'
                }`}
                title={
                  hasOpenClockIn ? 'You must clock out first' : 
                  !canClockIn && hasOpenClockIn ? 'You have an open clock-in. Please clock out first.' :
                  !canClockIn ? 'Cannot clock in' : ''
                }
              >
                <motion className="flex items-start gap-3">
                  <motion className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${
                    !hasOpenClockIn && canClockIn && !modalSubmitting
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-300 text-gray-500'
                  }`}>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                      {/* Clock circle */}
                      <circle cx="12" cy="12" r="9" />
                      {/* Clock hands */}
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3" />
                      {/* Arrow pointing in (right side) */}
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 12h-3m3 0l-2 2m2-2l-2-2" />
                    </svg>
                  </motion>
                  <motion className="flex-1 min-w-0">
                    <motion className={`text-base font-semibold mb-1 ${
                      !hasOpenClockIn && canClockIn && !modalSubmitting
                        ? 'text-gray-900'
                        : 'text-gray-400'
                    }`}>
                      Clock In
                    </motion>
                    <motion className={`text-xs ${
                      !hasOpenClockIn && canClockIn && !modalSubmitting
                        ? 'text-gray-600'
                        : 'text-gray-400'
                    }`}>
                      Start tracking your work time
                    </motion>
                  </motion>
                </motion>
              </button>

              {/* Clock Out Action Tile */}
              <button
                onClick={() => setClockType('out')}
                disabled={!hasOpenClockIn || !canClockOut || modalSubmitting}
                className={`w-full rounded-xl border-2 p-4 text-left transition-all duration-200 ${
                  hasOpenClockIn && canClockOut && !modalSubmitting
                    ? 'border-red-200 bg-red-50/50 hover:border-red-300 hover:bg-red-50 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] cursor-pointer'
                    : 'border-gray-200 bg-gray-50/50 cursor-not-allowed opacity-60'
                }`}
                title={!canClockOut && hasOpenClockIn ? 'Clock-in must be approved or pending' : ''}
              >
                <motion className="flex items-start gap-3">
                  <motion className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${
                    hasOpenClockIn && canClockOut && !modalSubmitting
                      ? 'bg-red-600 text-white'
                      : 'bg-gray-300 text-gray-500'
                  }`}>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                      {/* Clock circle */}
                      <circle cx="12" cy="12" r="9" />
                      {/* Clock hands */}
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3" />
                      {/* Arrow pointing out (left side) */}
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h3m-3 0l2 2m-2-2l2-2" />
                    </svg>
                  </motion>
                  <motion className="flex-1 min-w-0">
                    <motion className={`text-base font-semibold mb-1 ${
                      hasOpenClockIn && canClockOut && !modalSubmitting
                        ? 'text-gray-900'
                        : 'text-gray-400'
                    }`}>
                      Clock Out
                    </motion>
                    <motion className={`text-xs ${
                      hasOpenClockIn && canClockOut && !modalSubmitting
                        ? 'text-gray-600'
                        : 'text-gray-400'
                    }`}>
                      End your current work session
                    </motion>
                  </motion>
                </motion>
              </button>
            </motion>
          </motion>""".replace("<motion", "<motion"),
    """            }
            }
          >
            <div className={uiSpacing.sectionStack}>
              <ClockActionTile
                kind="in"
                enabled={!hasOpenClockIn && canClockIn}
                disabled={modalSubmitting}
                onClick={() => setClockType('in')}
                title={
                  hasOpenClockIn
                    ? 'You must clock out first'
                    : !canClockIn && hasOpenClockIn
                      ? 'You have an open clock-in. Please clock out first.'
                      : !canClockIn
                        ? 'Cannot clock in'
                        : undefined
                }
              />
              <ClockActionTile
                kind="out"
                enabled={hasOpenClockIn && canClockOut}
                disabled={modalSubmitting}
                onClick={() => setClockType('out')}
                title={!canClockOut && hasOpenClockIn ? 'Clock-in must be approved or pending' : undefined}
              />
            </motion>
          </AppCard>""".replace("<motion", "<div").replace("</motion>", "</motion>"),
    1,
)

print("partial - run manual")
p.write_text(text, encoding="utf-8")
