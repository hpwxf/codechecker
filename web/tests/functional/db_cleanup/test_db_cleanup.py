#
# -----------------------------------------------------------------------------
#                     The CodeChecker Infrastructure
#   This file is distributed under the University of Illinois Open Source
#   License. See LICENSE.TXT for details.
# -----------------------------------------------------------------------------
"""
Test database cleanup.
"""
from __future__ import print_function
from __future__ import division
from __future__ import absolute_import

import io
import json
import multiprocessing
import os
import unittest
from shutil import copyfile, rmtree

from codeCheckerDBAccess_v6.ttypes import *

from libtest import codechecker
from libtest import env


class TestDbCleanup(unittest.TestCase):

    def setUp(self):
        self.test_workspace = os.environ['TEST_WORKSPACE']

        test_class = self.__class__.__name__
        print('Running ' + test_class + ' tests in ' + self.test_workspace)

        self.codechecker_cfg = env.import_codechecker_cfg(self.test_workspace)
        self.test_dir = os.path.join(self.test_workspace, 'test_files')

        try:
            os.makedirs(self.test_dir)
        except os.error:
            # Directory already exists.
            pass

        cc_package = env.codechecker_package()
        original_severity_cfg = os.path.join(cc_package,
                                             'config',
                                             'checker_severity_map.json')

        self.workspace_severity_cfg = os.path.join(self.test_workspace,
                                                   'checker_severity_map.json')
        copyfile(original_severity_cfg, self.workspace_severity_cfg)

        self.codechecker_cfg['check_env']['CC_SEVERITY_MAP_FILE'] = \
            self.workspace_severity_cfg

    def __create_test_dir(self):
        makefile = "all:\n\t$(CXX) -c a/main.cpp -o /dev/null\n"
        project_info = {
            "name": "hello",
            "clean_cmd": "",
            "build_cmd": "make"
        }
        source_main = """
// Test file for db_cleanup
#include "f.h"
int main() { f(0); }
"""
        source_f = """
// Test file for db_cleanup
int f(int x) { return 1 / x; }
"""

        os.makedirs(os.path.join(self.test_dir, 'a'))

        with open(os.path.join(self.test_dir, 'Makefile'), 'w') as f:
            f.write(makefile)
        with open(os.path.join(self.test_dir, 'project_info.json'), 'w') as f:
            json.dump(project_info, f)
        with open(os.path.join(self.test_dir, 'a', 'main.cpp'), 'w') as f:
            f.write(source_main)
        with open(os.path.join(self.test_dir, 'a', 'f.h'), 'w') as f:
            f.write(source_f)

    def __rename_project_dir(self):
        os.rename(os.path.join(self.test_dir, 'a'),
                  os.path.join(self.test_dir, 'b'))

        makefile = "all:\n\t$(CXX) -c b/main.cpp -o /dev/null\n"

        with open(os.path.join(self.test_dir, 'Makefile'), 'w') as f:
            f.write(makefile)

    def __get_files_in_report(self):
        run_filter = RunFilter()
        run_filter.names = ['db_cleanup_test']
        run_filter.exactMatch = True

        codechecker.check_and_store(self.codechecker_cfg,
                                    'db_cleanup_test',
                                    self.test_dir)

        runs = self._cc_client.getRunData(run_filter, None, 0)
        run_id = runs[0].runId

        reports \
            = self._cc_client.getRunResults([run_id], 10, 0, [], None, None,
                                            False)

        details = self._cc_client.getReportDetails(reports[0].reportId)

        files = set()
        files.update(map(lambda bp: bp.fileId, details.pathEvents))
        files.update(map(lambda bp: bp.fileId, details.executionPath))

        file_ids = set()
        for file_id in files:
            file_data = self._cc_client.getSourceFileData(file_id, False, None)
            if file_data.fileId is not None:
                file_ids.add(file_data.fileId)

        return file_ids

    def __check_serverity_of_reports(self):
        """
        This will check whether reports in the database has the same severity
        levels as in the severity map config file.
        """
        run_filter = RunFilter()
        run_filter.names = ['db_cleanup_test']
        run_filter.exactMatch = True

        runs = self._cc_client.getRunData(run_filter, None, 0)
        run_id = runs[0].runId

        reports \
            = self._cc_client.getRunResults([run_id], 10, 0, [], None, None,
                                            False)

        with open(self.workspace_severity_cfg, 'r') as severity_cgf_file:
            severity_map = json.load(severity_cgf_file)
            for report in reports:
                severity_id = severity_map.get(report.checkerId, 'UNSPECIFIED')
                self.assertEqual(Severity._VALUES_TO_NAMES[report.severity],
                                 severity_id)

    def test_garbage_file_collection(self):
        event = multiprocessing.Event()
        event.clear()

        self.codechecker_cfg['viewer_port'] = env.get_free_port()
        env.export_test_cfg(self.test_workspace,
                            {'codechecker_cfg': self.codechecker_cfg})

        env.enable_auth(self.test_workspace)

        server_access = codechecker.start_server(self.codechecker_cfg, event)
        server_access['viewer_port'] \
            = self.codechecker_cfg['viewer_port']
        server_access['viewer_product'] \
            = self.codechecker_cfg['viewer_product']

        codechecker.add_test_package_product(server_access,
                                             self.test_workspace)

        self._cc_client = env.setup_viewer_client(self.test_workspace)
        self.assertIsNotNone(self._cc_client)

        self.__create_test_dir()
        files_in_report_before = self.__get_files_in_report()

        # Checker severity levels.
        self.__check_serverity_of_reports()

        self.__rename_project_dir()

        # Delete previous analysis report directory.
        rmtree(self.codechecker_cfg['reportdir'])

        files_in_report_after = self.__get_files_in_report()

        event.set()

        event.clear()

        # Change severity level of core.DivideZero to LOW.
        with io.open(self.workspace_severity_cfg, 'r+') as severity_cgf_file:
            severity_map = json.load(severity_cgf_file)
            severity_map['core.DivideZero'] = 'LOW'

            severity_cgf_file.seek(0)
            severity_cgf_file.truncate()
            severity_cgf_file.write(unicode(json.dumps(severity_map)))

        self.codechecker_cfg['viewer_port'] = env.get_free_port()
        env.export_test_cfg(self.test_workspace,
                            {'codechecker_cfg': self.codechecker_cfg})

        codechecker.start_server(self.codechecker_cfg,
                                 event)
        codechecker.login(self.codechecker_cfg,
                          self.test_workspace,
                          'cc',
                          'test')

        self._cc_client = env.setup_viewer_client(self.test_workspace)
        self.assertIsNotNone(self._cc_client)

        self.assertEqual(len(files_in_report_before & files_in_report_after),
                         0)

        for file_id in files_in_report_before:
            f = self._cc_client.getSourceFileData(file_id, False, None)
            self.assertIsNone(f.fileId)

        # Checker severity levels.
        self.__check_serverity_of_reports()

        event.set()
