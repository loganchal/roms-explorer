// Surface-pressure potential density from the ROMS nonlinear EOS polynomial.
// Jackett & McDougall (1995); ROMS mod_eoscoef.F / rho_eos.F (den1).
// T is model potential temperature, S practical salinity. The displayed
// anomaly sigma-theta is rho-theta - 1000 kg m^-3, NOT an energy anomaly.
export function potentialDensityAnomaly(temperature, salinity) {
    const t=Math.max(-2,temperature),s=Math.max(0,salinity);
    const c0=999.842594+t*(.06793952+t*(-.009095290+t*(.0001001685+t*(-.000001120083+t*.000000006536332))));
    const c1=.824493+t*(-.00408990+t*(.0000764380+t*(-.000000824670+t*.00000000538750)));
    const c2=-.00572466+t*(.000102270-t*.00000165460);
    return c0+s*(c1+Math.sqrt(s)*c2+s*.00048314)-1000;
}
