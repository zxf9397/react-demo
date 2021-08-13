import React, { useEffect, useRef, useState } from 'react';
import { useHistory, useLocation } from 'react-router';

interface FilterProps<T> {
  data: T;
  dataChange: (data: T) => void;
}

const queryString = (search: string) => {
  const reg = /[?|&|#](?<key>\w+)=*(?<value>(\[|\]|,|{|}|\w)*)/g;
  const params: Record<string, any> = {};
  let temp;
  while ((temp = reg.exec(search))) {
    const { key, value } = temp.groups as { key: string; value: string };
    if (key && value) {
      try {
        params[key] = JSON.parse(value);
      } catch (error) {
        params[key] = value;
      }
    }
  }
  return params;
};

const queryParmas = (params: Record<string, any>) => {
  return Object.entries(params).reduce((pre, cur, idx) => {
    if (Array.isArray(cur[1]) && cur[1].length <= 0) {
      return pre;
    }
    if (cur[1] == null) {
      return pre;
    }
    return pre + `${idx === 0 ? '#' : '&'}${cur[0]}=${JSON.stringify(cur[1])}`;
  }, '');
};

export default function Filter<T extends Record<string, any>>({ data, dataChange }: FilterProps<T>) {
  const history = useHistory();
  const location = useLocation();
  const ref = useRef(true);

  useEffect(() => {
    const handleHashChange = () => {
      ref.current = false;
      const params = queryString(location.hash);
      dataChange({ ...data, ...params });
    }
    window.addEventListener('hashchange', handleHashChange);
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    }
  }, [])

  useEffect(() => {
    if (ref.current) {
      const params = queryString(location.hash);
      history.replace({ pathname: location.pathname, hash: queryParmas({...data, ...params}) });
    } else {
      ref.current = true;
    }
  }, [data])
  return <></>
}
