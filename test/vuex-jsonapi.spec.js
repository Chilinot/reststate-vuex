import chai, { expect } from 'chai';
import { stub } from 'sinon';
import sinonChai from 'sinon-chai';
import Vue from 'vue';
import Vuex from 'vuex';
import { resourceStore } from '../src/vuex-jsonapi';

chai.use(sinonChai);
Vue.use(Vuex);

describe('resourceStore()', () => {
  let store;
  let api;

  beforeEach(() => {
    api = {
      get: stub(),
      post: stub(),
      patch: stub(),
      delete: stub(),
    };

    const storeConfig = resourceStore({
      name: 'widgets',
      httpClient: api,
    });
    store = new Vuex.Store({
      ...storeConfig,
      state: {
        records: [], // TODO find some nicer way to clone this
        related: [],
        filtered: [],
      },
    });
  });

  describe('loading from the server', () => {
    describe('all records', () => {
      it('returns the records', () => {
        api.get.resolves({
          data: {
            data: [
              {
                type: 'widget',
                id: '1',
                attributes: {
                  title: 'Foo',
                },
              },
              {
                type: 'widget',
                id: '2',
                attributes: {
                  title: 'Bar',
                },
              },
            ],
          },
        });

        return store.dispatch('loadAll')
          .then(() => {
            const records = store.getters.all;

            expect(records.length).to.equal(2);

            const firstRecord = records[0];
            expect(firstRecord.id).to.equal('1');
            expect(firstRecord.attributes.title).to.equal('Foo');
          });
      });

      it('allows including related records', () => {
        api.get.resolves({
          data: {
            data: [],
          },
        });

        return store.dispatch('loadAll', {
          options: {
            include: 'customers',
          },
        }).then(() => {
          expect(api.get).to.have.been.calledWith('widgets?include=customers');
        });
      });
    });

    describe('filtering', () => {
      beforeEach(() => {
        store.commit('REPLACE_ALL_RECORDS', [
          {
            type: 'widget',
            id: '1',
            attributes: {
              title: 'Non-Matching',
            },
          },
        ]);

        api.get.resolves({
          data: {
            data: [
              {
                type: 'widget',
                id: '2',
                attributes: {
                  title: 'Foo',
                },
              },
              {
                type: 'widget',
                id: '3',
                attributes: {
                  title: 'Bar',
                },
              },
            ],
          },
        });

        const filter = {
          status: 'draft',
        };

        return store.dispatch('loadBy', {
          filter,
          options: {
            include: 'customers',
          },
        });
      });

      it('passes the filter on to the server', () => {
        expect(api.get).to.have.been.calledWith(
          'widgets?filter[status]=draft&include=customers',
        );
      });

      it('allows retrieving the results by filter', () => {
        const all = store.getters.all;
        expect(all.length).to.equal(3);

        const filter = {
          status: 'draft',
        };

        const records = store.getters.where(filter);

        expect(records.length).to.equal(2);

        const firstRecord = records[0];
        expect(firstRecord.id).to.equal('2');
        expect(firstRecord.attributes.title).to.equal('Foo');
      });
    });

    describe('by ID', () => {
      const id = '42';
      const record = {
        type: 'widget',
        id,
        attributes: {
          title: 'New Title',
        },
        relationships: {
          customers: [],
        },
      };

      beforeEach(() => {
        api.get.resolves({
          data: {
            data: record,
          },
        });
      });

      describe('when the record is not yet present in the store', () => {
        beforeEach(() => {
          store.commit('REPLACE_ALL_RECORDS', [
            {
              type: 'widget',
              id: '27',
              attributes: {
                title: 'Old Title',
              },
            },
          ]);

          return store.dispatch('loadById', {
            id,
            options: {
              include: 'customers',
            },
          });
        });

        it('makes the correct request', () => {
          expect(api.get).to.have.been.calledWith(
            'widgets/42?include=customers',
          );
        });

        it('adds the record to the list of all records', () => {
          const records = store.getters.all;

          expect(records.length).to.equal(2);

          const storedRecord = records.find(r => r.id === id);
          expect(storedRecord.attributes.title).to.equal('New Title');
        });
      });

      describe('when the record is already present in the store', () => {
        beforeEach(() => {
          store.commit('REPLACE_ALL_RECORDS', [
            {
              type: 'widget',
              id: '42',
              attributes: {
                title: 'Old Title',
              },
            },
          ]);

          return store.dispatch('loadById', id);
        });

        it('overwrites the record in the store', () => {
          const records = store.getters.all;

          expect(records.length).to.equal(1);

          const storedRecord = records[0];
          expect(storedRecord.attributes.title).to.equal('New Title');
          expect(storedRecord.relationships.customers).to.deep.equal([]);
        });
      });
    });

    describe('related', () => {
      const parent = {
        type: 'users',
        id: '42',
      };

      describe('when relationship name is the same as resource name', () => {
        beforeEach(() => {
          api.get.resolves({
            data: {
              data: [
                {
                  type: 'widget',
                  id: '1',
                  attributes: {
                    title: 'Foo',
                  },
                },
                {
                  type: 'widget',
                  id: '2',
                  attributes: {
                    title: 'Bar',
                  },
                },
              ],
            },
          });

          return store.dispatch('loadRelated', { parent });
        });

        it('requests the resource endpoint', () => {
          expect(api.get).to.have.been.calledWith(
            'users/42/widgets?',
          );
        });

        it('allows retrieving related records', () => {
          const records = store.getters.related({ parent });
          expect(records.length).to.equal(2);
        });
      });

      describe('when relationship name is not the resource name', () => {
        beforeEach(() => {
          api.get.resolves({
            data: {
              data: [
                {
                  type: 'widget',
                  id: '1',
                  attributes: {
                    title: 'Foo',
                  },
                },
                {
                  type: 'widget',
                  id: '2',
                  attributes: {
                    title: 'Bar',
                  },
                },
              ],
            },
          });

          return store.dispatch('loadRelated', {
            parent,
            relationship: 'purchased-widgets',
          });
        });

        it('requests the resource endpoint', () => {
          expect(api.get).to.have.been.calledWith(
            'users/42/purchased-widgets?',
          );
        });

        it('allows retrieving related records', () => {
          const records = store.getters.related({
            parent,
            relationship: 'purchased-widgets',
          });
          expect(records.length).to.equal(2);
        });
      });
    });
  });

  describe('retrieving from the store', () => {
    beforeEach(() => {
      store.commit('REPLACE_ALL_RECORDS', [
        {
          type: 'widget',
          id: '27',
          attributes: {
            title: 'Foo',
          },
        },
        {
          type: 'widget',
          id: '42',
          attributes: {
            title: 'Bar',
          },
        },
      ]);
    });

    describe('all', () => {
      it('returns all records', () => {
        const result = store.getters.all;

        expect(result.length).to.equal(2);
        expect(result[0].id).to.equal('27');
      });
    });

    describe('by ID', () => {
      it('allows retrieving the record by ID', () => {
        const id = '42';
        const storedRecord = store.getters.find(id);
        expect(storedRecord.id).to.equal(id);
        expect(storedRecord.attributes.title).to.equal('Bar');
      });
    });

    describe('related', () => {
      it('allows retrieving related records', () => {
        store.commit('REPLACE_ALL_RELATED', [
          {
            type: 'user',
            id: '42',
            relatedIds: ['27', '42'],
          },
        ]);

        store.commit('REPLACE_ALL_RECORDS', [
          {
            type: 'widgets',
            id: '9',
            attributes: {
              title: 'Foo',
            },
          },
          {
            type: 'widgets',
            id: '27',
            attributes: {
              title: 'Bar',
            },
          },
          {
            type: 'widgets',
            id: '42',
            attributes: {
              title: 'Baz',
            },
          },
        ]);

        const parent = {
          type: 'user',
          id: '42',
        };

        const result = store.getters.related({
          parent,
          relationship: 'purchased-widgets',
        });

        expect(result.length).to.equal(2);
        expect(result[0].id).to.equal('27');
        expect(result[0].attributes.title).to.equal('Bar');
      });

      it('does not error out if there is no relationship data', () => {
        const parent = {
          type: 'user',
          id: '27',
        };

        const result = store.getters.related({
          parent,
          relationship: 'purchased-widgets',
        });

        expect(result).to.deep.equal([]);
      });
    });

    describe('filter', () => {
      it('does not error on filter that has not been sent', () => {
        const filter = {
          first: 'time',
        };

        const result = store.getters.where(filter);

        expect(result).to.deep.equal([]);
      });
    });
  });

  describe('creating', () => {
    const widget = {
      attributes: {
        title: 'Baz',
      },
    };

    beforeEach(() => {
      api.post.resolves({
        data: {
          data: {
            type: 'widget',
            id: '27',
            attributes: widget.attributes,
          },
        },
      });
    });

    it('sends the record to the server', () => {
      return store.dispatch('create', widget)
        .then(() => {
          const expectedBody = {
            data: {
              type: 'widgets',
              attributes: widget.attributes,
            },
          };
          expect(api.post).to.have.been.calledWith('widgets', expectedBody);
        });
    });

    it('adds the record to the list', () => {
      return store.dispatch('create', widget)
        .then(() => {
          const records = store.getters.all;

          expect(records.length).to.equal(1);

          const firstRecord = records[0];
          expect(firstRecord.id).to.equal('27');
          expect(firstRecord.attributes.title).to.equal('Baz');
        });
    });
  });

  describe('updating', () => {
    const record = {
      type: 'widget',
      id: '42',
      attributes: {
        title: 'Baz',
      },
    };

    const recordWithUpdatedData = {
      type: 'widget',
      id: '27',
      attributes: {
        title: 'Bar',
      },
    };

    beforeEach(() => {
      api.patch.resolves({ data: recordWithUpdatedData });
    });

    it('sends the record to the server', () => {
      const expectedBody = {
        data: record,
      };
      return store.dispatch('update', record)
        .then(() => {
          expect(api.patch).to.have.been.calledWith(
            `widgets/${record.id}`,
            expectedBody,
          );
        });
    });

    it('overwrites an existing record with the same ID', () => {
      store.commit('REPLACE_ALL_RECORDS', [
        {
          type: 'widget',
          id: '27',
          attributes: {
            title: 'Foo',
          },
        },
      ]);

      store.dispatch('update', recordWithUpdatedData)
        .then(() => {
          const records = store.getters.all;
          expect(records.length).to.equal(1);
          const firstRecord = records[0];
          expect(firstRecord.attributes.title).to.equal('Bar');
        });
    });
  });

  describe('deleting', () => {
    const record = {
      type: 'widget',
      id: '42',
      attributes: {
        title: 'Baz',
      },
    };

    const allRecords = [
      record,
      {
        type: 'widget',
        id: '27',
        attributes: {
          title: 'Other',
        },
      },
    ];

    let apiDouble;

    beforeEach(() => {
      store.commit('REPLACE_ALL_RECORDS', allRecords);

      api.delete.resolves();
    });

    it('sends the delete request to the server', () => {
      store.dispatch('delete', record)
        .then(() => {
          expect(api.delete).to.have.been.calledWith(`widgets/${record.id}`);
        });
    });

    it('removes the record from the list', () => {
      store.dispatch('delete', record)
        .then(() => {
          const records = store.getters.all;
          expect(records.length).to.equal(allRecords.length - 1);
        });
    });

    // TODO: handle error
  });
});
