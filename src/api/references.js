import { request } from './client.js';

export const getIndexes = () => request('/indexes');

export const getDayCountConventions = () => request('/day-count-conventions');
