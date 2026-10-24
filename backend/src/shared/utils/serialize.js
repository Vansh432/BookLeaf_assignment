const isPlainObject = (value) => value?.constructor === Object;

// Lean documents and aggregation results expose MongoDB's `_id`; the API consistently returns `id`.
export const withIds = (value) => {
  if (Array.isArray(value)) {
    return value.map(withIds);
  }

  if (!isPlainObject(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key === '_id' ? 'id' : key, withIds(entry)]),
  );
};
