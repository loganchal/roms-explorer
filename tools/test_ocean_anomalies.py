"""Small scientific checks for endpoint sampling and the seasonal reference."""
from datetime import datetime
from pathlib import Path
import tempfile
import unittest

import numpy as np
from netCDF4 import Dataset
from export_ocean_anomalies import profiles, surface, reference
from export_ocean_faces import edge_indices


class SeasonalReferenceTests(unittest.TestCase):
    def test_constant_climatology_is_constant_including_leap_day(self):
        clims={m:{'v':np.full((2,3),3.25)} for m in range(1,13)}
        for date in [datetime(2021,1,1),datetime(2024,2,29),datetime(2025,12,31)]:
            np.testing.assert_array_equal(reference(clims,date,'v'),3.25)

    def test_month_centre_recovers_the_monthly_mean(self):
        clims={m:{'v':np.array([float(m)])} for m in range(1,13)}
        np.testing.assert_allclose(reference(clims,datetime(2021,1,16),'v'),1)
        np.testing.assert_allclose(reference(clims,datetime(2024,2,15),'v'),2)

    def test_reference_is_continuous_across_new_year(self):
        clims={m:{'v':np.array([float(m)])} for m in range(1,13)}
        before=reference(clims,datetime(2021,12,31),'v')
        after=reference(clims,datetime(2022,1,1),'v')
        self.assertLess(float(abs(after-before)[0]),.4)


class BoundarySamplingTests(unittest.TestCase):
    def test_profiles_and_surfaces_share_exact_outer_endpoints(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'example.nc'
            with Dataset(path,'w') as d:
                for name,n in [('time',2),('s',3),('eta',7),('xi',6)]:d.createDimension(name,n)
                v=d.createVariable('temp','f4',('time','s','eta','xi'))
                values=np.arange(2*3*7*6,dtype='f4').reshape(2,3,7,6);v[:]=values
            ix=edge_indices(7,6,4)
            with Dataset(path) as d:
                for time in [0,slice(None)]:
                    top=profiles(d,'temp',time,ix)[...,-1,:]
                    s=surface(d,'temp',time,ix)
                    expected=np.concatenate([s[...,-1,:],s[...,0,:],s[...,:,-1],s[...,:,0]],axis=-1)
                    np.testing.assert_array_equal(top,expected)
                    np.testing.assert_array_equal(s[...,-1,-1],values[time,-1,-1,-1])


if __name__=='__main__':unittest.main()
