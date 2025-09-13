// RNG con seed reproducible (xfnv1a + mulberry32 correcto)
const RNG = (() => {
  function xfnv1a(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return () => h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); // ¡ojo al ^=!
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  class PRNG {
    constructor(rand) { this._rand = rand; }
    static fromSeedString(s) {
      const seed = xfnv1a(String(s))();
      return new PRNG(mulberry32(seed));
    }
    next() { return this._rand(); }                           // [0,1)
    randint(min, max) { return Math.floor(this.next()*(max-min+1)) + min; }
    shuffle(a) { for (let i=a.length-1;i>0;i--){ const j=Math.floor(this.next()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
  }
  PRNG.random = () => new PRNG(Math.random);
  return PRNG;
})();
