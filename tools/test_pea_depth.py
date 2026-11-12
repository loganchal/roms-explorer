"""Analytic checks for the local (non-cumulative) PEA display operator."""
import unittest
import numpy as np
from export_pea_depth import contribution,density,DEPTHS
class LocalPEA(unittest.TestCase):
 def test_uniform_density_is_zero(self):
  z=np.linspace(-200,0,101)
  q=contribution(np.full((101,1),1025.),z[:,None],np.array([200.]))
  np.testing.assert_allclose(q,0,atol=1e-7)
 def test_linear_profile_matches_local_formula_and_reduces_to_pea(self):
  D=200.;b=.005;z=np.linspace(-D,0,401);rho=1025-b*z
  q=contribution(rho[:,None],z[:,None],np.array([D]))[:,0]
  expected=9.81*b*(D/2-DEPTHS)*(-DEPTHS)
  np.testing.assert_allclose(q,expected,atol=5e-5)
  values=q[::-1].astype(float);dx=D/(len(values)-1)
  integral=dx/3*(values[0]+values[-1]+4*values[1:-1:2].sum()+2*values[2:-1:2].sum())
  self.assertAlmostEqual(integral/D,9.81*b*D*D/12,places=4)
  self.assertLess(q.min(),0);self.assertGreater(q.max(),0)
 def test_shallow_columns_clip_to_their_own_bottom(self):
  D=83.4;z=np.linspace(-D,0,201);b=.005
  q=contribution((1025-b*z)[:,None],z[:,None],np.array([D]))[:,0]
  depth=np.minimum(DEPTHS,D)
  np.testing.assert_allclose(q,9.81*b*(D/2-depth)*(-depth),atol=2e-5)
 def test_roms_potential_density_reference(self):
  self.assertAlmostEqual(float(density(3.,35.5)),1028.2845117925,places=9)
if __name__=='__main__':unittest.main()
