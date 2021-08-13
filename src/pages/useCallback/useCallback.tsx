import React, { useState } from 'react';

export default function useCallback() {
  const [count, setCount] = useState(0);
  return (
    <div>
      <button onClick={() => setCount(count + 1)}>+1</button>
      <button>req</button>
    </div>
  );
}
