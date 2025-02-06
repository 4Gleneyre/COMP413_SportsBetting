import { useState, useEffect } from 'react';

interface DateRangePickerProps {
  startDate: Date | null;
  endDate: Date | null;
  onChange: (dates: [Date | null, Date | null]) => void;
}

export default function DateRangePicker({ startDate, endDate, onChange }: DateRangePickerProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [hoveredDate, setHoveredDate] = useState<Date | null>(null);

  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  const isSelected = (date: Date) => {
    if (!startDate && !endDate) return false;
    if (startDate && !endDate) {
      return date.getTime() === startDate.getTime();
    }
    if (startDate && endDate) {
      return (
        date.getTime() === startDate.getTime() ||
        date.getTime() === endDate.getTime() ||
        (date > startDate && date < endDate)
      );
    }
    return false;
  };

  const isInRange = (date: Date) => {
    if (startDate && !endDate && hoveredDate) {
      const start = new Date(Math.min(startDate.getTime(), hoveredDate.getTime()));
      const end = new Date(Math.max(startDate.getTime(), hoveredDate.getTime()));
      return date > start && date < end;
    }
    return false;
  };

  const handleDateClick = (date: Date) => {
    if (!startDate || (startDate && endDate)) {
      onChange([date, null]);
    } else {
      if (date < startDate) {
        onChange([date, startDate]);
      } else {
        onChange([startDate, date]);
      }
    }
  };

  const renderDays = () => {
    const days = [];
    const daysInMonth = getDaysInMonth(currentMonth);
    const firstDay = getFirstDayOfMonth(currentMonth);

    // Add empty cells for days before the first day of the month
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="h-10" />);
    }

    // Add cells for each day of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
      const isSelectedDay = isSelected(date);
      const isInRangeDay = isInRange(date);
      const isTodayDay = isToday(date);

      days.push(
        <button
          key={day}
          onClick={() => handleDateClick(date)}
          onMouseEnter={() => setHoveredDate(date)}
          onMouseLeave={() => setHoveredDate(null)}
          className={`
            h-10 w-10 rounded-full flex items-center justify-center text-sm
            transition-colors relative
            ${
              isSelectedDay
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : isInRangeDay
                ? 'bg-blue-100 dark:bg-blue-900/50'
                : 'hover:bg-gray-100 dark:hover:bg-gray-700'
            }
            ${isTodayDay ? 'font-bold' : 'font-normal'}
          `}
        >
          {day}
        </button>
      );
    }

    return days;
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
  };

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={prevMonth}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
        <h2 className="text-lg font-semibold">
          {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </h2>
        <button
          onClick={nextMonth}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-2">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => (
          <div
            key={day}
            className="h-10 flex items-center justify-center text-sm font-medium text-gray-500 dark:text-gray-400"
          >
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">{renderDays()}</div>

      <div className="mt-4 space-y-2">
        <div className="text-sm text-gray-600 dark:text-gray-300">
          {startDate ? `Start: ${formatDate(startDate)}` : 'Select start date'}
        </div>
        <div className="text-sm text-gray-600 dark:text-gray-300">
          {endDate ? `End: ${formatDate(endDate)}` : 'Select end date'}
        </div>
      </div>
    </div>
  );
} 