Encoding = {
  digits : "0123456789BCDFGHJKLMNPQRSTVWXZbcdfghjklmnpqrstvwxz",

  fromNumber : function(number) {
    if (isNaN(Number(number)) || number === null || number === Number.POSITIVE_INFINITY || number < 0)
      throw "Invalid number";

    var digit;
    var residual = Math.floor(number);
    var result = '';
    while (true) {
      digit = residual % this.digits.length;
      result = this.digits.charAt(digit) + result;
      residual = Math.floor(residual / this.digits.length);

      if (residual == 0)
        break;
    }

    return result;
  },

  toNumber : function(encoded) {
    var result = 0;

    encoded = encoded.split('');
    for (e in encoded) {
      result = (result * this.digits.length) + this.digits.indexOf(encoded[e]);
    }

    return result;
  }
};

module.exports = Encoding;
