import dayjs from 'dayjs';
import { CHANGE_LOG_DATE_CACHE_KEY } from '../constants';
import { getLocalCache, setLocalCache } from './common';

type ChangeLog = {
  title: string;
  tab?: string;
  description?: string;
  images?: string[];
  date: string;
  link?: React.ReactElement;
};

export function getNewChangeLogsCount(logs: ChangeLog[]): number {
  const changeLogDate = getLocalCache(CHANGE_LOG_DATE_CACHE_KEY);
  if (changeLogDate) {
    const date = dayjs(changeLogDate);
    return logs.filter((log) => dayjs(log.date).isAfter(date)).length;
  }
  return logs.length;
}

export function setChangeLogViewDate(logs: ChangeLog[]) {
  if (logs.length > 0) {
    setLocalCache(CHANGE_LOG_DATE_CACHE_KEY, logs[0].date);
  }
}
