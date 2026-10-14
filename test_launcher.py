"""No browser launch, paid model call, or production service mutation."""
import unittest
from unittest.mock import patch,MagicMock
import launcher
class LauncherTests(unittest.TestCase):
    def test_health_identity_rejects_other_checkout(self):
        self.assertTrue(launcher.is_own_service({'product':'LectureReview','instance':launcher.instance_id()}))
        self.assertFalse(launcher.is_own_service({'product':'LectureReview','instance':'other'}))
        self.assertFalse(launcher.is_own_service(None))
    def test_reuse_own_server(self):
        with patch.object(launcher,'health',return_value={'product':'LectureReview','instance':launcher.instance_id()}):self.assertEqual(launcher.choose_port(8767),(8767,True))
    def test_free_port_does_not_reuse_foreign_server(self):
        probe=MagicMock();probe.__enter__.return_value=probe
        with patch.object(launcher,'health',return_value={'product':'Other'}),patch.object(launcher.socket,'socket',return_value=probe):self.assertEqual(launcher.choose_port(9000),(9000,False))
    def test_busy_port_moves_to_next(self):
        probe=MagicMock();probe.__enter__.return_value=probe;probe.bind.side_effect=[OSError('Busy'),None]
        with patch.object(launcher,'health',return_value=None),patch.object(launcher.socket,'socket',return_value=probe):self.assertEqual(launcher.choose_port(9000),(9001,False))
if __name__=='__main__':unittest.main()
