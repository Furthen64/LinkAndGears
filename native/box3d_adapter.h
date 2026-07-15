#ifndef LINK_AND_GEARS_BOX3D_ADAPTER_H
#define LINK_AND_GEARS_BOX3D_ADAPTER_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct lag_world lag_world;

typedef struct lag_body_state {
    unsigned long long id;
    double x;
    double y;
    double angle;
    double vx;
    double vy;
    double angular_velocity;
} lag_body_state;

lag_world *lag_world_create(double gravity_x, double gravity_y);
void lag_world_destroy(lag_world *world);
int lag_world_step(lag_world *world, double dt, int solver_iterations);
int lag_world_body_count(const lag_world *world);
int lag_world_read_bodies(const lag_world *world, lag_body_state *out, size_t capacity);

#ifdef __cplusplus
}
#endif

#endif
