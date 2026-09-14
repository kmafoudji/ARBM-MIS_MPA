"""Tests API — the results summary does not hand its traceback to the client.

The view used to wrap its body in `except Exception` and answer with the
exception text and the full `traceback.format_exc()` in the JSON body: file
paths, source lines and query fragments for anyone who could trigger an
error. An unexpected failure now reaches Django's own handler, which logs it
and answers a bare 500.
"""
from unittest import mock

import pytest
from rest_framework.test import APIClient

from tests.factories import ProjectFactory, UserFactory


@pytest.mark.django_db
def test_unexpected_error_returns_a_bare_500():
    client = APIClient(raise_request_exception=False)
    client.force_authenticate(user=UserFactory())
    project = ProjectFactory()

    with mock.patch(
        "apps.results.views.LogframeRow.objects.filter",
        side_effect=RuntimeError("secret detail"),
    ):
        resp = client.get(f"/api/projects/{project.pk}/results/summary/")

    assert resp.status_code == 500
    body = resp.content.decode()
    assert "Traceback" not in body
    assert "secret detail" not in body


@pytest.mark.django_db
def test_summary_still_answers():
    client = APIClient()
    client.force_authenticate(user=UserFactory())
    project = ProjectFactory()
    resp = client.get(f"/api/projects/{project.pk}/results/summary/")
    assert resp.status_code == 200
    assert resp.data["rows"] == []
