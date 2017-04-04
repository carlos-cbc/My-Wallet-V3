let proxyquire = require('proxyquireify')(require);

describe('Labels', () => {
  let AddressHD = (obj) => {
    return {
      constructor: {
        name: 'AddressHD'
      },
      label: obj === null ? null : obj.label,
      toJSON: () => {
        if (obj && obj.label !== null) {
          return {label: obj.label};
        } else {
          return null;
        }
      }
    };
  };

  let stubs = {
    './address-hd': AddressHD
  };

  let Labels = proxyquire('../src/labels', stubs);

  let wallet;

  let l;

  beforeEach(() => {
    wallet = {
      hdwallet: {
        accounts: [{
          index: 0,
          receiveAddressAtIndex: (index) => `0-${index}`,
          receiveIndex: 2,
          lastUsedReceiveIndex: 1,
          _address_labels: [{index: 1, label: 'Hello'}]
        }]
      }
    };
  });

  describe('class', () => {
    // Includes helper method init()
    describe('new Labels()', () => {
      it('should create a Labels object', () => {
        l = new Labels(wallet, () => {});
        expect(l.constructor.name).toEqual('Labels');
      });

      it('should require syncWallet function', () => {
        expect(() => {
          l = new Labels(wallet);
        }).toThrow();
      });
    });
  });

  describe('instance', () => {
    beforeEach(() => {
      l = new Labels(wallet, (success) => { success(); });
    });

    describe('toJSON', () => {
      beforeEach(() => {
      });

      it('should serialize labels', () => {
        let json = JSON.stringify(l);
        let res = JSON.parse(json);
        expect(res.accounts[0].length).toEqual(2);
        expect(res.accounts[0][1].label).toEqual('Hello');
      });

      it('should remove trailing null values', () => {
        l._accounts[0].push(AddressHD(null));
        let json = JSON.stringify(l);
        let res = JSON.parse(json);
        expect(res.accounts[0].length).toEqual(2);
      });

      it('should not serialize non-expected fields', () => {
        l.rarefield = 'I am an intruder';
        let json = JSON.stringify(l, null, 2);
        let obj = JSON.parse(json);

        expect(obj.rarefield).not.toBeDefined();
      });
    });

    describe('readOnly', () => {
      it('should be false', () => {
        expect(l.readOnly).toEqual(false);
      });
    });

    describe('reserveReceiveAddress()', () => {
      let account;

      beforeEach(() => {
        account = wallet.hdwallet.accounts[0];
      });

      it('should return the first available address', () => {
        expect(l.reserveReceiveAddress(0).receiveAddress).toEqual('0-2');
      });

      it('should check if reusableIndex is null or integer if present', () => {
        expect(() => {
          l.reserveReceiveAddress(0, {reusableIndex: 0});
        }).not.toThrow();

        expect(() => {
          l.reserveReceiveAddress(0, {reusableIndex: null});
        }).not.toThrow();

        expect(() => {
          l.reserveReceiveAddress(0, {reusableIndex: -1});
        }).toThrow();
      });

      it('should fail if GAP limit is reached and no reusable index is given', () => {
        account.receiveIndex = 25;
        expect(() => {
          l.reserveReceiveAddress(0);
        }).toThrow(Error('gap_limit'));
      });

      describe('.commit()', () => {
        let reservation;
        beforeEach(() => {
          reservation = l.reserveReceiveAddress(0);
          spyOn(l, 'setLabel');
        });

        it('should label the address', () => {
          reservation.commit('Exchange order #1');
          expect(l.setLabel).toHaveBeenCalledWith(0, 2, 'Exchange order #1');
        });

        it('should append label if reusableIndex is present and gap limit reached', () => {
          account.lastUsedReceiveIndex = 0;
          account.receiveIndex = 20;

          spyOn(l, 'getLabel').and.returnValue('Exchange order #1');

          reservation = l.reserveReceiveAddress(0, {reusableIndex: 1});

          reservation.commit('Exchange order #2');
          expect(l.getLabel).toHaveBeenCalledWith(0, 1);
          expect(l.setLabel).toHaveBeenCalledWith(0, 1, 'Exchange order #1, Exchange order #2');
        });
      });
    });

    describe('setLabel()', () => {
      it('should call syncWallet()', () => {
        spyOn(l, 'syncWallet');
        l.setLabel(0, 1, 'Updated Label');
        expect(l.syncWallet).toHaveBeenCalled();
      });

      it('should not call syncWallet() if label is unchanged', () => {
        spyOn(l, 'syncWallet');
        l.setLabel(0, 1, 'Hello');
        expect(l.syncWallet).not.toHaveBeenCalled();
      });
    });

    describe('addLabel()', () => {
      it('should call syncWallet()', () => {
        spyOn(l, 'syncWallet').and.callThrough();
        l.addLabel(0, 15, 'New Label');
        expect(l.syncWallet).toHaveBeenCalled();
      });
    });

    describe('removeLabel()', () => {
      it('should call syncWallet()', () => {
        spyOn(l, 'syncWallet');
        l.removeLabel(0, 1);
        expect(l.syncWallet).toHaveBeenCalled();
      });
    });

    describe('releaseReceiveAddress()', () => {
      let addressHD = {
        constructor: {
          name: 'AddressHD'
        }
      };

      beforeEach(() => {
        spyOn(l, 'removeLabel');
        spyOn(l, 'setLabel');
        spyOn(l, 'getAddress').and.returnValue(addressHD);
      });

      it('should remove the label', () => {
        l.releaseReceiveAddress(0, 1);
        expect(l.removeLabel).toHaveBeenCalledWith(0, addressHD);
      });

      it('should remove one of multible ids in a label', () => {
        addressHD.label = 'Exchange Order #1, Exchange Order #2';
        l.releaseReceiveAddress(0, 2, {expectedLabel: 'Exchange Order #2'});
        expect(l.setLabel).toHaveBeenCalledWith(0, addressHD, 'Exchange Order #1');
      });

      it('should deal with comma', () => {
        addressHD.label = 'Exchange Order #2, Exchange Order #1';
        l.releaseReceiveAddress(0, 2, {expectedLabel: 'Exchange Order #2'});
        expect(l.setLabel).toHaveBeenCalledWith(0, addressHD, 'Exchange Order #1');
      });

      it('should not touch existing label when in doubt, for multible ids in a label', () => {
        addressHD.label = 'Exchange Order #1, Customized Order #2 label';
        l.releaseReceiveAddress(0, 2, {expectedLabel: 'Exchange Order #2'});
        expect(l.setLabel).not.toHaveBeenCalled();

        l.releaseReceiveAddress(0, 2);
        expect(l.setLabel).not.toHaveBeenCalled();
      });
    });
  });
});