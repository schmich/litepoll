Encoding = {
  digits : "0123456789BCDFGHJKLMNPQRSTVWXZbcdfghjklmnpqrstvwxz",

  fromNumber : function(number) {
    if (isNaN(Number(number)) || number === null || number === Number.POSITIVE_INFINITY || number < 0)
      throw "Invalid number";

    var residual = Math.floor(number);
    var result = '';
    while (true) {
      var digit = residual % this.digits.length;
      result = this.digits.charAt(digit) + result;
      residual = Math.floor(residual / this.digits.length);

      if (residual == 0)
        break;
    }

    return result;
  },

  toNumber : function(encoded) {
    if (!encoded)
      return NaN;

    var result = 0;

    encoded = encoded.split('');
    for (e in encoded) {
      var index = this.digits.indexOf(encoded[e]);
      if (index < 0) {
        return NaN;
      }

      result = (result * this.digits.length) + index;
    }

    return result;
  }
};

module.exports = Encoding;
