import { ResourceClient } from '@reststate/client';

const storeRecord = (records) => (newRecord) => {
  const existingRecord = records.find(r => r.id === newRecord.id);
  if (existingRecord) {
    Object.assign(existingRecord, newRecord);
  } else {
    records.push(newRecord);
  }
};

const matches = (criteria) => (test) => (
  Object.keys(criteria).every(key => (
    criteria[key] === test[key]
  ))
);

const handleError = (commit) => (error) => {
  commit('STORE_ERROR');
  throw error;
};

const resourceModule = ({ name: resourceName, httpClient }) => {
  const client = new ResourceClient({ name: resourceName, httpClient });

  return {
    namespaced: true,

    state: {
      records: [],
      related: [],
      filtered: [],
      loading: false,
      error: false,
    },

    mutations: {
      REPLACE_ALL_RECORDS: (state, records) => {
        state.records = records;
      },

      REPLACE_ALL_RELATED: (state, related) => {
        state.related = related;
      },

      SET_LOADING: (state, isLoading) => {
        state.loading = isLoading;
      },

      STORE_ERROR: (state) => {
        state.error = true;
      },

      STORE_RECORD: (state, newRecord) => {
        const { records } = state;

        storeRecord(records)(newRecord);
      },

      STORE_RECORDS: (state, newRecords) => {
        const { records } = state;

        newRecords.forEach(storeRecord(records));
      },

      STORE_RELATED: (state, parent) => {
        const { related } = state;

        storeRecord(related)(parent);
      },

      STORE_FILTERED: (state, { filter, matches }) => {
        const { filtered } = state;

        const ids = matches.map(({ id }) => id);

        // TODO: handle overwriting existing one
        filtered.push({ filter, ids });
      },

      REMOVE_RECORD: (state, record) => {
        state.records = state.records.filter(r => r.id !== record.id);
      },
    },

    actions: {
      loadAll({ commit }, { options } = {}) {
        commit('SET_LOADING', true);
        return client.all({ options })
          .then(result => {
            commit('SET_LOADING', false);
            commit('STORE_RECORDS', result.data);
          })
          .catch(handleError(commit));
      },

      loadById({ commit }, { id, options }) {
        return client.find({ id, options })
          .then(results => {
            commit('STORE_RECORD', results.data);
          })
          .catch(handleError(commit));
      },

      loadWhere({ commit }, { filter, options }) {
        return client.where({ filter, options })
          .then(results => {
            const matches = results.data;
            commit('STORE_RECORDS', matches);
            commit('STORE_FILTERED', { filter, matches });
          })
          .catch(handleError(commit));
      },

      loadRelated({ commit }, {
        parent,
        relationship = resourceName,
        options,
      }) {
        return client.related({ parent, relationship, options })
          .then(results => {
            const { id, type } = parent;
            const relatedRecords = results.data;
            const relatedIds = relatedRecords.map(record => record.id);
            commit('STORE_RECORDS', relatedRecords);
            commit('STORE_RELATED', { id, type, relatedIds });
          })
          .catch(handleError(commit));
      },

      create({ commit }, recordData) {
        return client.create(recordData)
          .then(result => {
            commit('STORE_RECORD', result.data);
          })
          .catch(handleError(commit));
      },

      update({ commit }, record) {
        return client.update(record)
          .then(() => {
            commit('STORE_RECORD', record);
          })
          .catch(handleError(commit));
      },

      delete({ commit }, record) {
        return client.delete(record)
          .then(() => {
            commit('REMOVE_RECORD', record);
          })
          .catch(handleError(commit));
      },
    },

    getters: {
      loading: state => state.loading,
      error: state => state.error,
      all: state => state.records,
      byId: state => ({ id }) => state.records.find(r => r.id === id),
      where: state => ({ filter }) => {
        const matchesRequestedFilter = matches(filter);
        const entry = state.filtered.find(({ filter: testFilter }) => (
          matchesRequestedFilter(testFilter)
        ));

        if (!entry) {
          return [];
        }

        const { ids } = entry;
        return state.records.filter(record => ids.includes(record.id));
      },
      related: state => ({
        parent,
        relationship = resourceName,
      }) => {
        const { type, id } = parent;
        const related = state.related.find(matches({ type, id }));

        if (!related) {
          return [];
        }

        const ids = related.relatedIds;
        return state.records.filter(record => ids.includes(record.id));
      },
    },
  };
};

const mapResourceModules = ({ names, httpClient }) => (
  names.reduce(
    (acc, name) => (
      Object.assign({ [name]: resourceModule({ name, httpClient }) }, acc)
    ),
    {},
  )
);

export {
  resourceModule,
  mapResourceModules,
};
