export function buildFilterCriterias(payload: any) {
  const filter: any = {};
  let pagination: any = {};
  const order: any = {};

  if (payload) {
    if (
      payload.page != null &&
      payload.page > 0 &&
      payload.limit != null &&
      payload.limit > 0
    ) {
      pagination = {
        skip: (payload.page - 1) * payload.limit,
        take: payload.limit,
      };
    }

    if (payload.orderBy != null && payload.orderBy !== '') {
      Object.assign(order, {
        [payload.orderBy]:
          payload.orderSequence > 0
            ? 'ASC'
            : payload.orderSequence < 0
            ? 'DESC'
            : '',
      });
    }
  }

  return {
    filter,
    pagination,
    order,
  };
}
