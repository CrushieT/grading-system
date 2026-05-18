
from django.contrib import admin
from django.urls import include, path
from django.views.generic import RedirectView
from apps import views

urlpatterns = [
    path('admin/', admin.site.urls),

    path('', RedirectView.as_view(pattern_name='login', permanent=False)),

    # frontend pages
    path('login.html', views.login_page, name='login'),
    path('dashboard.html', views.dashboard_page, name='dashboard'),

    # auth api
    path('api/auth/', include('apps.urls.auth')),
    path('api/', include('apps.urls.setup')),
]
