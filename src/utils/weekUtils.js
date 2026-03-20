export function getISOWeekKey(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

function getThursdayOfWeek(weekKey) {
  const [yearStr, weekStr] = weekKey.split('-W')
  const year = parseInt(yearStr)
  const week = parseInt(weekStr)
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const dayOfWeek = jan4.getUTCDay() || 7
  const monday = new Date(jan4)
  monday.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1 + (week - 1) * 7)
  const thursday = new Date(monday)
  thursday.setUTCDate(monday.getUTCDate() + 3)
  return thursday
}

export function getWeekKeysForPeriod(period, availableWeeks, now = new Date()) {
  const currentWeek = getISOWeekKey(now)

  switch (period) {
    case 'this_week':
      return availableWeeks.filter(w => w === currentWeek)

    case 'last_week': {
      const d = new Date(now)
      d.setUTCDate(d.getUTCDate() - 7)
      const lastWeek = getISOWeekKey(d)
      return availableWeeks.filter(w => w === lastWeek)
    }

    case 'this_month': {
      const month = now.getUTCMonth()
      const year = now.getUTCFullYear()
      return availableWeeks.filter(w => {
        const thu = getThursdayOfWeek(w)
        return thu.getUTCFullYear() === year && thu.getUTCMonth() === month
      })
    }

    case 'last_month': {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
      const month = d.getUTCMonth()
      const year = d.getUTCFullYear()
      return availableWeeks.filter(w => {
        const thu = getThursdayOfWeek(w)
        return thu.getUTCFullYear() === year && thu.getUTCMonth() === month
      })
    }

    case 'all':
      return [...availableWeeks]

    default:
      return []
  }
}
