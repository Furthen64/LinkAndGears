#include "box3d_adapter.h"

int main(void) {
    lag_world *probe_world = lag_world_create(0.0, -9.81);
    if (probe_world == NULL) {
        return 1;
    }

    if (lag_world_body_count(probe_world) != 0) {
        lag_world_destroy(probe_world);
        return 2;
    }

    lag_world_destroy(probe_world);
    return 0;
}
