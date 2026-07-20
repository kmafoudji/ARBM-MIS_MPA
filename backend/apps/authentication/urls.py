from django.urls import path

from . import views

app_name = "authentication"

urlpatterns = [
    path("login/", views.login_view, name="login"),
    path("callback/", views.callback_view, name="callback"),
    path("me/", views.me_view, name="me"),
    path("logout/", views.logout_view, name="logout"),
    path("login/local/", views.local_login_view, name="local_login"),
]
